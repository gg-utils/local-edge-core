/**
 * @fileoverview `hostnames` exposure backend: one host per app, shaped
 * `<app>.<realm>.<method>.<machine>.<rootZone>`, routed by SNI on one loopback router port.
 *
 * Plan-only. Every step needs someone else first (the DNS owner for the zone, a certificate for
 * the realm wildcard, the tailnet admin for split DNS), so `plan()` prints the full set of steps
 * and `apply()` always refuses. Nothing here starts nginx or dnsmasq, writes resolver files, or
 * issues certificates. Rendering reuses core helpers: hostnames from `hostname.ts`, nginx server
 * blocks from `nginx.ts`, the dnsmasq rule and macOS resolver text from `dns.ts`, and the mkcert
 * command from `tls.ts`.
 * Flow: manifest + hostnames settings -> per-app server blocks -> router DNS, TLS and tailnet steps.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract and the hostnames settings type.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import path from "node:path";
import { LocalEdgeCore_renderDnsmasqConfig, LocalEdgeCore_renderMacosResolverContent, LocalEdgeCore_resolveMacosResolverPath } from "./dns.js";
import { LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST, LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureIsPort, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
import { LocalEdgeCore_buildHostnameFromParts } from "./hostname.js";
import { LocalEdgeCore_renderNginxServerBlock } from "./nginx.js";
import { LocalEdgeCore_buildMkcertArgv } from "./tls.js";
/** Backend name for SNI-routed hostnames. */
export const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Validates hostname settings. Returns problems; empty means valid. */
export function LocalEdgeCore_validateExposureHostnames(manifest) {
    const settings = manifest.hostnames;
    if (settings === undefined) {
        return ["hostnames settings are missing from the manifest"];
    }
    const problems = [];
    for (const [field, value] of [
        ["realm", settings.realm],
        ["method", settings.method],
        ["machine", settings.machine],
    ]) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
            problems.push(`hostnames.${field} "${value}" must be one lowercase DNS label`);
        }
    }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(settings.rootZone)) {
        problems.push(`hostnames.rootZone "${settings.rootZone}" is not a DNS zone`);
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
    if (settings.dns.listenAddress !== LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST) {
        problems.push(`hostnames.dns.listenAddress must be ${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}`);
    }
    for (const app of manifest.apps) {
        if (app.enabled && app.localPort === settings.routerPort) {
            problems.push(`${app.id}: local port equals the router port`);
        }
    }
    return problems;
}
/** Builds `<app>.<realm>.<method>.<machine>.<rootZone>`. */
export function LocalEdgeCore_buildExposureHostname(settings, surface) {
    return LocalEdgeCore_buildHostnameFromParts({
        surface,
        realmSlug: settings.realm,
        method: settings.method,
        developerSlug: settings.machine,
        rootZone: settings.rootZone,
    });
}
/** Wildcard covering every app host of one realm, for example `*.main.nginx.m3.example.internal`. */
export function LocalEdgeCore_buildExposureRealmWildcard(settings) {
    return `*.${settings.realm}.${settings.method}.${settings.machine}.${settings.rootZone}`;
}
/** Certificate and key paths the plan uses for the realm. */
export function LocalEdgeCore_resolveExposureHostnamesTlsPaths(settings) {
    if (settings.tls.mode === "provided") {
        return { certPath: settings.tls.certPath, keyPath: settings.tls.keyPath };
    }
    const base = `${settings.realm}.${settings.method}.${settings.machine}.${settings.rootZone}`;
    return {
        certPath: path.join(settings.tls.certDir, `${base}.pem`),
        keyPath: path.join(settings.tls.certDir, `${base}-key.pem`),
    };
}
function LocalEdgeCore_edgeUrl(host, port) {
    return port === 443 ? `https://${host}` : `https://${host}:${String(port)}`;
}
/** Builds every planned action for the hostname backend. Pure. */
export function LocalEdgeCore_planExposureHostnames(manifest, options = {}) {
    const problems = [
        ...LocalEdgeCore_validateExposureManifest(manifest),
        ...LocalEdgeCore_validateExposureHostnames(manifest),
    ];
    const settings = manifest.hostnames;
    if (problems.length > 0 || settings === undefined) {
        return manifest.apps.map((app) => ({
            appId: app.id,
            kind: app.enabled ? "refuse" : "skip",
            requires: "none",
            target: LocalEdgeCore_exposureTargetUrl(app.localPort),
            reason: app.enabled ? `manifest invalid: ${problems.join("; ")}` : "app is disabled",
        }));
    }
    const tls = LocalEdgeCore_resolveExposureHostnamesTlsPaths(settings);
    const actions = manifest.apps.map((app) => {
        const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
        if (!app.enabled) {
            return { appId: app.id, kind: "skip", requires: "none", target, reason: "app is disabled" };
        }
        const host = LocalEdgeCore_buildExposureHostname(settings, app.edgeName ?? app.id);
        return {
            appId: app.id,
            kind: "manual",
            requires: "dns-tls-owner",
            target,
            edgeUrl: LocalEdgeCore_edgeUrl(host, settings.routerPort),
            reason: `nginx server block for ${host} on ${settings.routerHost}:${String(settings.routerPort)}`,
            detail: LocalEdgeCore_renderNginxServerBlock({
                method: settings.method,
                listenHost: settings.routerHost,
                listenPort: settings.routerPort,
                serverNames: [host],
                tls: { certPath: tls.certPath, keyPath: tls.keyPath },
                surfaceHeader: app.edgeName ?? app.id,
                upstreamHost: LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST,
                upstreamPort: app.localPort,
                variableName: `upstream_${(app.edgeName ?? app.id).replace(/-/g, "_")}`,
                websocketSafe: true,
                routerHealthPath: "/__local-edge/router-health",
                routerHealthBody: "ok",
            }),
        };
    });
    const routerTarget = `${settings.routerHost}:${String(settings.routerPort)}`;
    actions.push({
        appId: "router:dns",
        kind: "manual",
        requires: "dns-tls-owner",
        target: routerTarget,
        reason: `dnsmasq answers *.${settings.method}.${settings.machine}.${settings.rootZone} with ${settings.routerHost}; the macOS resolver file sends that zone to dnsmasq`,
        detail: [
            "# dnsmasq.conf",
            LocalEdgeCore_renderDnsmasqConfig({
                port: String(settings.dns.port),
                listenAddress: settings.dns.listenAddress,
                addressRules: [
                    {
                        method: settings.method,
                        developerSlug: settings.machine,
                        rootZone: settings.rootZone,
                        ipAddress: settings.routerHost,
                    },
                ],
                logPath: settings.dns.logPath,
                defaultIpAddress: null,
            }).trimEnd(),
            `# ${LocalEdgeCore_resolveMacosResolverPath({ resolverDir: settings.dns.resolverDir, rootZone: settings.rootZone })}`,
            LocalEdgeCore_renderMacosResolverContent({
                nameserver: settings.dns.listenAddress,
                port: String(settings.dns.port),
                timeoutSeconds: 1,
                searchOrder: 1,
            }).trimEnd(),
        ].join("\n"),
    });
    const wildcard = LocalEdgeCore_buildExposureRealmWildcard(settings);
    actions.push(settings.tls.mode === "mkcert"
        ? {
            appId: "router:tls",
            kind: "manual",
            requires: "dns-tls-owner",
            target: routerTarget,
            reason: `mkcert wildcard certificate for ${wildcard}; mkcert's local CA must be trusted on each client`,
            argv: LocalEdgeCore_buildMkcertArgv({ certPath: tls.certPath, keyPath: tls.keyPath, hostnames: [wildcard] }),
        }
        : {
            appId: "router:tls",
            kind: "manual",
            requires: "dns-tls-owner",
            target: routerTarget,
            reason: `provided certificate must cover ${wildcard}`,
            detail: `cert: ${tls.certPath}\nkey: ${tls.keyPath}`,
        });
    if (settings.tailnetTcp !== false) {
        actions.push({
            appId: "router:tailnet",
            kind: "manual",
            requires: "tailnet-admin",
            target: routerTarget,
            reason: `raw TCP so TLS and SNI pass through to the router; useful once tailnet split DNS sends ${settings.rootZone} to this node`,
            argv: [
                options.tailscaleBin ?? "tailscale",
                "serve",
                `--tcp=${String(settings.routerPort)}`,
                `tcp://${routerTarget}`,
            ],
        });
    }
    return actions;
}
/** Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse. */
export function LocalEdgeCore_createHostnamesBackend(options = {}) {
    const name = LOCAL_EDGE_CORE_HOSTNAMES_BACKEND;
    const build = (manifest) => LocalEdgeCore_buildExposurePlan({
        backend: name,
        hostname: manifest.hostnames
            ? LocalEdgeCore_buildExposureRealmWildcard(manifest.hostnames)
            : null,
        actions: LocalEdgeCore_planExposureHostnames(manifest, options),
    });
    const refuse = (dryRun) => LocalEdgeCore_refusedExposureApply({
        backend: name,
        dryRun,
        message: `${name} is plan-only: DNS, certificates and tailnet split DNS need their owners; run the planned steps by hand`,
    });
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
                requires: app.enabled ? "dns-tls-owner" : "none",
                target: LocalEdgeCore_exposureTargetUrl(app.localPort),
                reason: app.enabled ? "remove the app's server block and reload nginx" : "app is disabled",
            })),
        }),
        apply: (_plan, applyOptions) => refuse(applyOptions?.apply !== true),
        remove: (_manifest, removeOptions) => refuse(removeOptions?.apply !== true),
        status: (manifest) => manifest.apps.map((app) => ({
            appId: app.id,
            state: app.enabled ? "unknown" : "disabled",
            edgeUrl: app.enabled && manifest.hostnames
                ? LocalEdgeCore_edgeUrl(LocalEdgeCore_buildExposureHostname(manifest.hostnames, app.edgeName ?? app.id), manifest.hostnames.routerPort)
                : null,
            target: LocalEdgeCore_exposureTargetUrl(app.localPort),
            observedTarget: null,
            note: `${name} is plan-only; status is not observed`,
        })),
    };
}
