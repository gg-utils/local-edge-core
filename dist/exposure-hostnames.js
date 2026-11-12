/**
 * @fileoverview `hostnames` exposure backend: one public DNS name per app under one wildcard,
 * routed by SNI on one loopback nginx port.
 *
 * Names default to `<app>.<projectMachineLabel>.<rootZone>` for the main realm and
 * `<app>--<realm>.<projectMachineLabel>.<rootZone>` for other realms, so the single wildcard
 * `*.<projectMachineLabel>.<rootZone>` (one DNS record, one certificate) covers every host. The
 * pattern is a template or a function in config.
 *
 * The backend is plan-only: `apply()` and `remove()` always refuse. The plan lists the router
 * config (rendered here; a supervisor writes and starts it), the provided certificate with a
 * check that its folder is private and outside git, the lego DNS-01 install, issue and renewal
 * steps (env variable names only), the wildcard DNS records, and the raw-TCP Serve mapping of the
 * router port. Nothing here issues certificates, edits DNS, starts nginx or changes Serve.
 * Flow: manifest + hostnames settings -> names -> nginx config + owner steps -> plan.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract and the hostnames settings type.
 * @see src/hostname.ts - Compact name builder, template renderer and label checks.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import fs from "node:fs";
import path from "node:path";
import { LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST, LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureDefaultCommandRunner, LocalEdgeCore_exposureIsPort, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
import { LocalEdgeCore_checkDnsLabel, LocalEdgeCore_checkHostnameLabels, LocalEdgeCore_renderHostnameTemplate, LocalEdgeCore_sanitizeRealmSlug, } from "./hostname.js";
import { LocalEdgeCore_renderNginxHttpConfig, LocalEdgeCore_renderNginxServerBlock } from "./nginx.js";
import { LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES, LocalEdgeCore_buildLegoDns01Argv } from "./tls.js";
/** Backend name for SNI-routed hostnames. */
export const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Default hostname template. `{label}` is `<app>` or `<app>--<realm>`. */
export const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE = "{label}.{projectMachine}.{rootZone}";
/** Default wildcard template. */
export const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD = "*.{projectMachine}.{rootZone}";
/** Router health path answered by nginx itself on every host. */
export const LOCAL_EDGE_CORE_HOSTNAMES_ROUTER_HEALTH_PATH = "/__local-edge/router-health";
/** Default probe: `stat` the folder and walk up looking for a `.git` entry. Reads only. */
export const LocalEdgeCore_inspectPrivateDir = (dir) => {
    let mode;
    try {
        mode = fs.statSync(dir).mode & 0o777;
    }
    catch {
        mode = null;
    }
    let current = path.resolve(dir);
    for (;;) {
        if (fs.existsSync(path.join(current, ".git"))) {
            return { exists: mode !== null, mode, gitRoot: current };
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return { exists: mode !== null, mode, gitRoot: null };
        }
        current = parent;
    }
};
/** Fills the parts a hostname pattern receives for one app name. */
function LocalEdgeCore_hostnameParts(settings, app) {
    return {
        app,
        realm: settings.realm,
        mainRealm: settings.mainRealm ?? "main",
        projectMachineLabel: settings.projectMachineLabel,
        rootZone: settings.rootZone,
    };
}
/** Builds the host for one app: config function, then template, then the compact default. */
export function LocalEdgeCore_buildExposureHostname(settings, app) {
    const parts = LocalEdgeCore_hostnameParts(settings, app);
    if (settings.buildHostname) {
        return settings.buildHostname(parts);
    }
    return LocalEdgeCore_renderHostnameTemplate(settings.hostnameTemplate ?? LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE, parts);
}
/** Builds the wildcard every host must sit directly under, for example `*.proj-m1.example.test`. */
export function LocalEdgeCore_buildExposureHostnamesWildcard(settings) {
    return (settings.wildcardTemplate ?? LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD)
        .replace("{projectMachine}", settings.projectMachineLabel)
        .replace("{rootZone}", settings.rootZone);
}
/** Edge URL for a host behind the router port. */
export function LocalEdgeCore_hostnamesEdgeUrl(host, port) {
    return port === 443 ? `https://${host}` : `https://${host}:${String(port)}`;
}
/** Lists the enabled apps with their hosts. Throws when a name cannot be built. */
export function LocalEdgeCore_listExposureHostnames(manifest, settings) {
    return manifest.apps
        .filter((app) => app.enabled)
        .map((app) => {
        const name = app.edgeName ?? app.id;
        return { appId: app.id, name, host: LocalEdgeCore_buildExposureHostname(settings, name), localPort: app.localPort };
    });
}
/** Problems with paths in the settings that must be absolute. */
function LocalEdgeCore_pathProblems(settings) {
    const paths = [
        ["tls.certPath", settings.tls.certPath],
        ["tls.keyPath", settings.tls.keyPath],
        ["nginx.confPath", settings.nginx.confPath],
        ["nginx.pidPath", settings.nginx.pidPath],
        ["nginx.errorLogPath", settings.nginx.errorLogPath],
        ["nginx.accessLogPath", settings.nginx.accessLogPath],
        ["nginx.tempDir", settings.nginx.tempDir],
        ["nginx.mimeTypesPath", settings.nginx.mimeTypesPath],
        ["acme.dataDir", settings.acme?.dataDir],
    ];
    return paths
        .filter(([, value]) => value !== undefined && !path.isAbsolute(value))
        .map(([field]) => `hostnames.${field} must be an absolute path`);
}
/**
 * Validates the hostname settings and every app name: DNS labels, one host per app, each host
 * directly under the wildcard, loopback router on a valid unprotected port, absolute paths.
 * Returns problems; empty means valid.
 */
export function LocalEdgeCore_validateExposureHostnames(manifest) {
    const settings = manifest.hostnames;
    if (settings === undefined) {
        return ["hostnames settings are missing from the manifest"];
    }
    const problems = [];
    const labelProblem = LocalEdgeCore_checkDnsLabel(settings.projectMachineLabel);
    if (labelProblem !== null) {
        problems.push(`hostnames.projectMachineLabel: ${labelProblem}`);
    }
    if (!settings.rootZone.includes(".")) {
        problems.push(`hostnames.rootZone "${settings.rootZone}" must have at least two labels`);
    }
    problems.push(...LocalEdgeCore_checkHostnameLabels(settings.rootZone).map((p) => `hostnames.rootZone: ${p}`));
    if (LocalEdgeCore_sanitizeRealmSlug(settings.realm).length === 0) {
        problems.push(`hostnames.realm "${settings.realm}" has no usable characters`);
    }
    if (settings.routerHost !== LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST) {
        problems.push(`hostnames.routerHost must be ${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}`);
    }
    if (!LocalEdgeCore_exposureIsPort(settings.routerPort)) {
        problems.push(`hostnames.routerPort ${String(settings.routerPort)} is not a valid TCP port`);
    }
    else if (manifest.protectedPorts.includes(settings.routerPort)) {
        problems.push(`hostnames.routerPort ${String(settings.routerPort)} is protected`);
    }
    problems.push(...LocalEdgeCore_pathProblems(settings));
    if (settings.acme && LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES[settings.acme.dnsProvider] === undefined) {
        problems.push(`hostnames.acme.dnsProvider "${settings.acme.dnsProvider}" has no known env names`);
    }
    const wildcard = LocalEdgeCore_buildExposureHostnamesWildcard(settings);
    problems.push(...LocalEdgeCore_checkHostnameLabels(wildcard));
    const wildcardParent = wildcard.replace(/^\*\./, "");
    const seen = new Map();
    for (const app of manifest.apps) {
        if (!app.enabled) {
            continue;
        }
        if (app.localPort === settings.routerPort) {
            problems.push(`${app.id}: local port equals the router port`);
        }
        let host;
        try {
            host = LocalEdgeCore_buildExposureHostname(settings, app.edgeName ?? app.id);
        }
        catch (error) {
            problems.push(`${app.id}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        problems.push(...LocalEdgeCore_checkHostnameLabels(host).map((p) => `${app.id}: ${p}`));
        const [left, ...restLabels] = host.split(".");
        if (left === "*" || restLabels.join(".") !== wildcardParent) {
            problems.push(`${app.id}: ${host} is not directly under ${wildcard}`);
        }
        const other = seen.get(host);
        if (other !== undefined) {
            problems.push(`${app.id}: ${host} is already used by ${other}`);
        }
        seen.set(host, app.id);
    }
    return problems;
}
/** Renders the server block for one host. */
function LocalEdgeCore_renderHostServerBlock(settings, entry) {
    return LocalEdgeCore_renderNginxServerBlock({
        method: LOCAL_EDGE_CORE_HOSTNAMES_BACKEND,
        listenHost: settings.routerHost,
        listenPort: settings.routerPort,
        serverNames: [entry.host],
        tls: { certPath: settings.tls.certPath, keyPath: settings.tls.keyPath },
        surfaceHeader: entry.name,
        upstreamHost: LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST,
        upstreamPort: entry.localPort,
        variableName: `upstream_${entry.name.replace(/[^a-zA-Z0-9]/g, "_")}`,
        websocketSafe: true,
        routerHealthPath: LOCAL_EDGE_CORE_HOSTNAMES_ROUTER_HEALTH_PATH,
        routerHealthBody: "ok",
    });
}
/** Throws unless the manifest and hostname settings are valid; returns the settings. */
function LocalEdgeCore_requireValidHostnames(manifest) {
    const problems = [
        ...LocalEdgeCore_validateExposureManifest(manifest),
        ...LocalEdgeCore_validateExposureHostnames(manifest),
    ];
    if (problems.length > 0 || manifest.hostnames === undefined) {
        throw new Error(`local-edge-core-hostnames-invalid: ${problems.join("; ")}`);
    }
    return manifest.hostnames;
}
/**
 * Renders the whole router `nginx.conf`: pid, logs and temp paths from config, a default server
 * that rejects the TLS handshake for unknown names, and one SNI server block per enabled app.
 * Pure. Throws when the settings or names are invalid.
 */
export function LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest) {
    const settings = LocalEdgeCore_requireValidHostnames(manifest);
    const { nginx } = settings;
    const listen = `${settings.routerHost}:${String(settings.routerPort)}`;
    const serverBlocks = [
        `  server {
    listen ${listen} ssl default_server;
    server_name _;
    ssl_reject_handshake on;
  }`,
        ...LocalEdgeCore_listExposureHostnames(manifest, settings).map((entry) => LocalEdgeCore_renderHostServerBlock(settings, entry)),
    ];
    const http = LocalEdgeCore_renderNginxHttpConfig({
        generatedBy: "@gg-utils/local-edge-core hostnames backend",
        mimeTypesPath: nginx.mimeTypesPath,
        workerProcesses: 1,
        workerConnections: 256,
        keepaliveTimeoutSeconds: 65,
        serverNamesHashBucketSize: 128,
        variablesHashBucketSize: 128,
        variablesHashMaxSize: 2048,
        clientBodyTimeoutSeconds: 60,
        clientMaxBodySize: "64m",
        proxyConnectTimeoutSeconds: 10,
        proxyReadTimeoutSeconds: 300,
        proxySendTimeoutSeconds: 300,
        sendTimeoutSeconds: 300,
        timeoutCommentLines: [],
        dockerResolver: null,
        serverBlocks,
    });
    const httpPaths = [
        `  access_log ${nginx.accessLogPath};`,
        ...["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map((name) => `  ${name}_temp_path ${path.join(nginx.tempDir, name)};`),
    ].join("\n");
    return http
        .replace(/^worker_processes /m, `pid ${nginx.pidPath};\nerror_log ${nginx.errorLogPath};\nworker_processes `)
        .replace(/^http \{\n/m, `http {\n${httpPaths}\n`);
}
/** Reads the node's tailnet addresses from `tailscale status --json`. Read-only. */
export function LocalEdgeCore_readTailnetAddresses(runner, tailscaleBin) {
    try {
        const result = runner(tailscaleBin, ["status", "--json"]);
        if (result.status !== 0) {
            return {};
        }
        const parsed = JSON.parse(result.stdout);
        const list = Array.isArray(parsed.Self?.TailscaleIPs) ? parsed.Self.TailscaleIPs : [];
        const ips = list.filter((ip) => typeof ip === "string");
        const ipv4 = ips.find((ip) => ip.includes("."));
        const ipv6 = ips.find((ip) => ip.includes(":"));
        return { ...(ipv4 ? { ipv4 } : {}), ...(ipv6 ? { ipv6 } : {}) };
    }
    catch {
        return {};
    }
}
/** Lists why a folder is not private (0700) and outside any git checkout. Empty means fine. */
export function LocalEdgeCore_privateDirProblems(dir, probe) {
    const seen = probe(dir);
    const problems = [];
    if (!seen.exists) {
        problems.push(`${dir} does not exist yet; create it with mode 0700`);
    }
    else if (seen.mode !== 0o700) {
        problems.push(`${dir} is mode ${(seen.mode ?? 0).toString(8)}, want 700`);
    }
    if (seen.gitRoot !== null) {
        problems.push(`${dir} is inside the git checkout ${seen.gitRoot}`);
    }
    return problems;
}
/** Builds every planned action for the hostname backend. Reads only (status JSON, folder modes). */
export function LocalEdgeCore_planExposureHostnames(manifest, options = {}) {
    let settings;
    try {
        settings = LocalEdgeCore_requireValidHostnames(manifest);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return manifest.apps.map((app) => ({
            appId: app.id,
            kind: app.enabled ? "refuse" : "skip",
            requires: "none",
            target: LocalEdgeCore_exposureTargetUrl(app.localPort),
            reason: app.enabled ? `manifest invalid: ${message}` : "app is disabled",
        }));
    }
    const probe = options.inspectDir ?? LocalEdgeCore_inspectPrivateDir;
    const tailscaleBin = options.tailscaleBin ?? "tailscale";
    const routerTarget = `${settings.routerHost}:${String(settings.routerPort)}`;
    const wildcard = LocalEdgeCore_buildExposureHostnamesWildcard(settings);
    const hosts = new Map(LocalEdgeCore_listExposureHostnames(manifest, settings).map((entry) => [entry.appId, entry]));
    const actions = manifest.apps.map((app) => {
        const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
        const entry = hosts.get(app.id);
        if (entry === undefined) {
            return { appId: app.id, kind: "skip", requires: "none", target, reason: "app is disabled" };
        }
        return {
            appId: app.id,
            kind: "manual",
            requires: "dns-tls-owner",
            target,
            edgeUrl: LocalEdgeCore_hostnamesEdgeUrl(entry.host, settings.routerPort),
            reason: `server_name ${entry.host} on ${routerTarget}; live once the certificate exists`,
            detail: LocalEdgeCore_renderHostServerBlock(settings, entry),
        };
    });
    actions.push({
        appId: "router:nginx",
        kind: "manual",
        requires: "dns-tls-owner",
        target: routerTarget,
        reason: `a supervisor writes ${settings.nginx.confPath}, checks it with nginx -t and starts it; needs the certificate`,
        argv: [options.nginxBin ?? "nginx", "-c", settings.nginx.confPath],
    });
    const tlsProblems = [
        ...new Set([
            ...LocalEdgeCore_privateDirProblems(path.dirname(settings.tls.certPath), probe),
            ...LocalEdgeCore_privateDirProblems(path.dirname(settings.tls.keyPath), probe),
        ]),
    ];
    actions.push({
        appId: "router:tls",
        kind: "manual",
        requires: "dns-tls-owner",
        target: routerTarget,
        reason: `provided certificate for ${wildcard}; ${tlsProblems.length === 0 ? "folder is 0700 and outside git" : tlsProblems.join("; ")}`,
        detail: `cert: ${settings.tls.certPath}\nkey: ${settings.tls.keyPath}`,
    });
    if (settings.acme) {
        const { acme } = settings;
        const envNames = LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES[acme.dnsProvider] ?? [];
        const dataDirProblems = LocalEdgeCore_privateDirProblems(acme.dataDir, probe);
        actions.push({
            appId: "router:acme-install",
            kind: "manual",
            requires: "none",
            target: routerTarget,
            reason: "install lego (listed only; never run by this backend)",
            argv: acme.installArgv ?? ["brew", "install", "lego"],
        }, {
            appId: "router:acme",
            kind: "manual",
            requires: "dns-tls-owner",
            target: routerTarget,
            reason: `lego DNS-01 (${acme.dnsProvider}) for ${wildcard}; the owner supplies env ${envNames.join(", ")}; ${dataDirProblems.length === 0 ? "data folder is 0700 and outside git" : dataDirProblems.join("; ")}`,
            argv: LocalEdgeCore_buildLegoDns01Argv({
                legoBin: options.legoBin,
                dnsProvider: acme.dnsProvider,
                domains: [wildcard],
                dataDir: acme.dataDir,
                email: acme.email,
                server: acme.server,
                keyType: acme.keyType,
                deployHook: acme.deployHook,
            }),
            detail: [
                `env names: ${envNames.join(", ")} (values never printed)`,
                ...(acme.runScript ? [`wrapper: ${acme.runScript}`] : []),
                ...(acme.deployHook
                    ? [`deploy hook copies the result to ${settings.tls.certPath} and ${settings.tls.keyPath}`]
                    : []),
            ].join("\n"),
        }, {
            appId: "router:acme-renew",
            kind: "manual",
            requires: "dns-tls-owner",
            target: routerTarget,
            reason: `renewal: rerun the same lego run, which renews only near expiry${acme.renewal ? `; ${acme.renewal}` : ""}`,
            argv: acme.runScript ? ["/bin/sh", acme.runScript] : undefined,
        });
    }
    const addresses = settings.addresses ??
        LocalEdgeCore_readTailnetAddresses(options.runner ?? LocalEdgeCore_exposureDefaultCommandRunner, tailscaleBin);
    const recordName = wildcard.slice(0, wildcard.length - settings.rootZone.length - 1);
    const records = [
        `${recordName} A ${addresses.ipv4 ?? "<tailnet IPv4>"}`,
        ...(addresses.ipv6 ? [`${recordName} AAAA ${addresses.ipv6}`] : []),
    ];
    const dnsLive = settings.dnsLive === true;
    actions.push({
        appId: "router:dns",
        kind: dnsLive ? "noop" : "manual",
        requires: dnsLive ? "none" : "dns-tls-owner",
        target: routerTarget,
        reason: dnsLive
            ? `records under ${settings.rootZone} reported live by the owner`
            : `the zone owner adds these records under ${settings.rootZone}`,
        detail: records.join("\n"),
    });
    if (settings.tailnetTcp !== false) {
        actions.push({
            appId: "router:tailnet",
            kind: "manual",
            requires: "none",
            target: routerTarget,
            reason: "raw TCP so TLS and SNI reach the router; a go-live step, never applied by this backend",
            argv: [tailscaleBin, "serve", "--bg", `--tcp=${String(settings.routerPort)}`, `tcp://${routerTarget}`],
        });
    }
    return actions;
}
/** Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse. */
export function LocalEdgeCore_createHostnamesBackend(options = {}) {
    const name = LOCAL_EDGE_CORE_HOSTNAMES_BACKEND;
    const build = (manifest) => LocalEdgeCore_buildExposurePlan({
        backend: name,
        hostname: manifest.hostnames ? LocalEdgeCore_buildExposureHostnamesWildcard(manifest.hostnames) : null,
        actions: LocalEdgeCore_planExposureHostnames(manifest, options),
    });
    const refuse = (dryRun) => LocalEdgeCore_refusedExposureApply({
        backend: name,
        dryRun,
        message: `${name} is plan-only: certificates, DNS and the Serve mapping are owner steps; run the planned steps by hand`,
    });
    const edgeUrlFor = (manifest, appName) => {
        if (!manifest.hostnames) {
            return null;
        }
        try {
            return LocalEdgeCore_hostnamesEdgeUrl(LocalEdgeCore_buildExposureHostname(manifest.hostnames, appName), manifest.hostnames.routerPort);
        }
        catch {
            return null;
        }
    };
    return {
        name,
        requires: "dns-tls-owner",
        plan: build,
        planRemove: (manifest) => LocalEdgeCore_buildExposurePlan({
            backend: name,
            hostname: null,
            actions: manifest.apps.map((app) => ({
                appId: app.id,
                kind: app.enabled ? "manual" : "skip",
                requires: "none",
                target: LocalEdgeCore_exposureTargetUrl(app.localPort),
                reason: app.enabled
                    ? "disable the app in config; a supervisor rewrites the router config and reloads nginx"
                    : "app is disabled",
            })),
        }),
        apply: (_plan, applyOptions) => refuse(applyOptions?.apply !== true),
        remove: (_manifest, removeOptions) => refuse(removeOptions?.apply !== true),
        status: (manifest) => manifest.apps.map((app) => ({
            appId: app.id,
            state: app.enabled ? "unknown" : "disabled",
            edgeUrl: app.enabled ? edgeUrlFor(manifest, app.edgeName ?? app.id) : null,
            target: LocalEdgeCore_exposureTargetUrl(app.localPort),
            observedTarget: null,
            note: `${name} is plan-only; status is not observed`,
        })),
    };
}
