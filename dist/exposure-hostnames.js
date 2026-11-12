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
import { LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES, LocalEdgeCore_buildLegoDns01Argv } from "./tls.js";
/** Backend name for SNI-routed hostnames. */
export const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Default hostname template. `{label}` is `<app>` or `<app>--<realm>`. */
export const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE = "{label}.{projectMachine}.{rootZone}";
/** Default wildcard template. */
export const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD = "*.{projectMachine}.{rootZone}";
/**
 * Default probe: `stat` the folder and walk up looking for a `.git` entry. Reads only.
 *
 * @param dir - Folder to inspect.
 * @returns Whether it exists, its permission bits, and the nearest enclosing folder holding `.git`.
 * @example
 * ```typescript
 * LocalEdgeCore_inspectPrivateDir("/srv/edge/tls"); // { exists: true, mode: 0o700, gitRoot: null }
 * ```
 */
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
/**
 * Builds the host for one app: config function, then template, then the compact default.
 *
 * @param settings - Hostname settings.
 * @param app - App name (its `edgeName` or id).
 * @param appTemplate - Per-app template that wins over the settings.
 * @returns The host, not yet validated.
 * @throws When the compact label cannot be built (invalid, too long, or a two-character app in a non-main realm).
 * @example
 * ```typescript
 * LocalEdgeCore_buildExposureHostname({ ...settings, realm: "pr-7" }, "web"); // "web--pr-7.proj-node1.example.test"
 * ```
 */
export function LocalEdgeCore_buildExposureHostname(settings, app, appTemplate) {
    const parts = LocalEdgeCore_hostnameParts(settings, app);
    if (appTemplate !== undefined) {
        return LocalEdgeCore_renderHostnameTemplate(appTemplate, parts);
    }
    if (settings.buildHostname) {
        return settings.buildHostname(parts);
    }
    return LocalEdgeCore_renderHostnameTemplate(settings.hostnameTemplate ?? LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE, parts);
}
/**
 * Builds the wildcard every host must sit directly under, for example `*.proj-node1.example.test`.
 *
 * @param settings - Hostname settings.
 * @returns `wildcardTemplate` (default `*.{projectMachine}.{rootZone}`) with its tokens filled; not validated.
 * @example
 * ```typescript
 * LocalEdgeCore_buildExposureHostnamesWildcard(settings); // "*.proj-node1.example.test"
 * ```
 */
export function LocalEdgeCore_buildExposureHostnamesWildcard(settings) {
    return (settings.wildcardTemplate ?? LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD)
        .replace("{projectMachine}", settings.projectMachineLabel)
        .replace("{rootZone}", settings.rootZone);
}
/** Fills `{projectMachine}` and `{rootZone}` in a wildcard template. */
function LocalEdgeCore_fillWildcardTemplate(settings, template) {
    return template.replace("{projectMachine}", settings.projectMachineLabel).replace("{rootZone}", settings.rootZone);
}
/**
 * Every wildcard hosts may sit under: the main one first, then `extraWildcardTemplates`.
 *
 * @param settings - Hostname settings.
 * @returns The main wildcard followed by each filled `extraWildcardTemplates` entry.
 * @example
 * ```typescript
 * LocalEdgeCore_buildExposureHostnamesWildcards({ ...settings, extraWildcardTemplates: ["*.node1.{rootZone}"] });
 * // ["*.proj-node1.example.test", "*.node1.example.test"]
 * ```
 */
export function LocalEdgeCore_buildExposureHostnamesWildcards(settings) {
    return [
        LocalEdgeCore_buildExposureHostnamesWildcard(settings),
        ...(settings.extraWildcardTemplates ?? []).map((template) => LocalEdgeCore_fillWildcardTemplate(settings, template)),
    ];
}
/**
 * nginx regex `map` key matching every SNI name under a zone, for example `~\.example\.test$`.
 *
 * @param rootZone - Zone whose names should match.
 * @returns A `~`-prefixed regex with regex metacharacters escaped.
 * @example
 * ```typescript
 * LocalEdgeCore_sniZoneSuffixPattern("example.test"); // "~\\.example\\.test$"
 * ```
 */
export function LocalEdgeCore_sniZoneSuffixPattern(rootZone) {
    return `~\\.${rootZone.replace(/[.\\^$|?*+()[\]{}]/g, (c) => `\\${c}`)}$`;
}
/**
 * Edge URL for a host behind the router port.
 *
 * @param host - Host name.
 * @param port - Client-facing port; 443 is left out of the URL.
 * @example
 * ```typescript
 * LocalEdgeCore_hostnamesEdgeUrl("web.proj-node1.example.test", 8460); // "https://web.proj-node1.example.test:8460"
 * ```
 */
export function LocalEdgeCore_hostnamesEdgeUrl(host, port) {
    return port === 443 ? `https://${host}` : `https://${host}:${String(port)}`;
}
/**
 * Lists the enabled apps with their hosts. Throws when a name cannot be built.
 *
 * @param manifest - Manifest whose enabled apps are listed.
 * @param settings - Hostname settings.
 * @returns One entry per enabled app with its host, loopback port and extra locations.
 * @throws When a host cannot be built; validate first to get problems instead.
 * @example
 * ```typescript
 * LocalEdgeCore_listExposureHostnames(manifest, settings).map((entry) => entry.host);
 * ```
 */
export function LocalEdgeCore_listExposureHostnames(manifest, settings) {
    return manifest.apps
        .filter((app) => app.enabled)
        .map((app) => {
        const name = app.edgeName ?? app.id;
        return {
            appId: app.id,
            name,
            host: LocalEdgeCore_buildExposureHostname(settings, name, app.hostnameTemplate),
            localPort: app.localPort,
            locations: app.locations ?? [],
        };
    });
}
/**
 * Characters nginx reads as syntax in an unquoted directive argument: whitespace (including
 * newlines), quotes, `;`, `{`, `}`, `#` (comment), `$` (variable), `\\` (escape), and controls.
 */
const LOCAL_EDGE_CORE_NGINX_UNSAFE_ARGUMENT = /[\s"'`;{}#$\\\u0000-\u001f\u007f]/;
/**
 * The one check every path written into the router config goes through: the path must be
 * absolute and free of any character nginx would read as syntax. No quoting is attempted, so a
 * rejected path can never be smuggled in through escaping.
 *
 * @param field - Config field name used in the message, for example `hostnames.nginx.pidPath`.
 * @param value - Path from config.
 * @returns `null` when the path is safe to write unquoted, otherwise the problem.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_nginxPathProblem("hostnames.nginx.pidPath", "/srv/edge/nginx.pid"); // null
 * LocalEdgeCore_nginxPathProblem("hostnames.nginx.pidPath", "/srv/x.pid;\nuser root"); // problem text
 * ```
 */
export function LocalEdgeCore_nginxPathProblem(field, value) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
        return `${field} must be an absolute path`;
    }
    if (LOCAL_EDGE_CORE_NGINX_UNSAFE_ARGUMENT.test(value)) {
        return `${field} ${JSON.stringify(value)} has a character nginx reads as syntax (whitespace, a quote, ; { } # $ \\ or a control character)`;
    }
    return null;
}
/**
 * Returns `value` for writing into the router config, or throws. Every rendered path directive
 * (`pid`, `error_log`, `include`, `access_log`, `*_temp_path`, `ssl_certificate*`) uses it, so
 * the renderer stays safe even when called without validation.
 *
 * @param field - Config field name used in the error.
 * @param value - Path from config.
 * @returns The unchanged path.
 * @throws `local-edge-core-nginx-unsafe-path` when `LocalEdgeCore_nginxPathProblem` reports a problem.
 *
 * @example
 * ```typescript
 * `pid ${LocalEdgeCore_nginxPathArgument("hostnames.nginx.pidPath", nginx.pidPath)};`;
 * ```
 */
export function LocalEdgeCore_nginxPathArgument(field, value) {
    const problem = LocalEdgeCore_nginxPathProblem(field, value);
    if (problem !== null) {
        throw new Error(`local-edge-core-nginx-unsafe-path: ${problem}`);
    }
    return value;
}
/** Problems with paths in the settings: each must be absolute and safe to write into nginx config. */
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
    return paths.flatMap(([field, value]) => {
        if (value === undefined) {
            return [];
        }
        const problem = LocalEdgeCore_nginxPathProblem(`hostnames.${field}`, value);
        return problem === null ? [] : [problem];
    });
}
/**
 * Validates the hostname settings and every app name: DNS labels and 253-character names, one host per app, each host
 * directly under the wildcard, loopback router and client edge port on valid unprotected ports, and absolute paths free of nginx syntax characters.
 * Returns problems; empty means valid.
 *
 * @example
 * ```typescript
 * const problems = LocalEdgeCore_validateExposureHostnames(manifest);
 * if (problems.length > 0) throw new Error(problems.join("; "));
 * ```
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
    if (settings.edgePort !== undefined) {
        if (!LocalEdgeCore_exposureIsPort(settings.edgePort)) {
            problems.push(`hostnames.edgePort ${String(settings.edgePort)} is not a valid TCP port`);
        }
        else if (manifest.protectedPorts.includes(settings.edgePort)) {
            problems.push(`hostnames.edgePort ${String(settings.edgePort)} is protected`);
        }
    }
    const workers = settings.nginx.workerConnections;
    if (workers !== undefined && !(Number.isInteger(workers) && workers >= 1 && workers <= 1_048_576)) {
        problems.push(`hostnames.nginx.workerConnections ${String(workers)} is not a positive integer`);
    }
    problems.push(...LocalEdgeCore_pathProblems(settings));
    if (settings.acme && LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES[settings.acme.dnsProvider] === undefined) {
        problems.push(`hostnames.acme.dnsProvider "${settings.acme.dnsProvider}" has no known env names`);
    }
    const wildcards = LocalEdgeCore_buildExposureHostnamesWildcards(settings);
    for (const wildcard of wildcards) {
        problems.push(...LocalEdgeCore_checkHostnameLabels(wildcard));
        if (!wildcard.startsWith("*.") || !wildcard.endsWith(`.${settings.rootZone}`)) {
            problems.push(`hostnames wildcard ${wildcard} must be *.<label>.${settings.rootZone}`);
        }
    }
    const wildcardParents = new Set(wildcards.map((wildcard) => wildcard.replace(/^\*\./, "")));
    problems.push(...LocalEdgeCore_listenerProblems(manifest, settings));
    problems.push(...LocalEdgeCore_streamProblems(manifest, settings));
    const seen = new Map();
    for (const app of manifest.apps) {
        if (!app.enabled) {
            continue;
        }
        if (app.localPort === settings.routerPort) {
            problems.push(`${app.id}: local port equals the router port`);
        }
        const paths = new Set();
        for (const location of app.locations ?? []) {
            for (const [field, value] of [["path", location.path], ["upstreamPath", location.upstreamPath]]) {
                if (value !== undefined && !/^\/[A-Za-z0-9._~\/-]*$/.test(value)) {
                    problems.push(`${app.id}: location ${field} "${value}" must start with / and use only URL path characters`);
                }
            }
            if (location.path === "/" || paths.has(location.path)) {
                problems.push(`${app.id}: location ${location.path} is duplicated`);
            }
            paths.add(location.path);
            if (!LocalEdgeCore_exposureIsPort(location.localPort) || location.localPort === settings.routerPort) {
                problems.push(`${app.id}: location ${location.path} port ${String(location.localPort)} is not a valid upstream port`);
            }
        }
        let host;
        try {
            host = LocalEdgeCore_buildExposureHostname(settings, app.edgeName ?? app.id, app.hostnameTemplate);
        }
        catch (error) {
            problems.push(`${app.id}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        problems.push(...LocalEdgeCore_checkHostnameLabels(host).map((p) => `${app.id}: ${p}`));
        const [left, ...restLabels] = host.split(".");
        if (left === "*" || !wildcardParents.has(restLabels.join("."))) {
            problems.push(`${app.id}: ${host} is not directly under ${wildcards.join(" or ")}`);
        }
        const other = seen.get(host);
        if (other !== undefined) {
            problems.push(`${app.id}: ${host} is already used by ${other}`);
        }
        seen.set(host, app.id);
    }
    return problems;
}
/** Port clients use to reach the router (the Serve TCP port); defaults to the router port. */
function LocalEdgeCore_clientEdgePort(settings) {
    return settings.edgePort ?? settings.routerPort;
}
/**
 * The router's HTTP listeners. Omitted in config: one TLS listener on `routerPort`.
 *
 * @param settings - Hostname settings.
 * @returns Each listener with `ssl` (default true) and `clientPort` (default `edgePort` for `routerPort`, else its own port) filled.
 * @example
 * ```typescript
 * LocalEdgeCore_routerListeners({ ...settings, edgePort: 8470 }); // [{ port: 8460, ssl: true, clientPort: 8470 }]
 * ```
 */
export function LocalEdgeCore_routerListeners(settings) {
    const listeners = settings.listeners ?? [{ port: settings.routerPort }];
    return listeners.map((listener) => ({
        port: listener.port,
        ssl: listener.ssl ?? true,
        clientPort: listener.clientPort ?? (listener.port === settings.routerPort ? LocalEdgeCore_clientEdgePort(settings) : listener.port),
    }));
}
/** Loopback ports the apps and their extra locations use. */
function LocalEdgeCore_appPorts(manifest) {
    return new Set(manifest.apps.flatMap((app) => [app.localPort, ...(app.locations ?? []).map((location) => location.localPort)]));
}
/** Checks the listener list: valid, unique, unprotected ports that include `routerPort`. */
function LocalEdgeCore_listenerProblems(manifest, settings) {
    if (settings.listeners === undefined) {
        return [];
    }
    const problems = [];
    const seen = new Set();
    const appPorts = LocalEdgeCore_appPorts(manifest);
    for (const listener of settings.listeners) {
        const label = `hostnames.listeners port ${String(listener.port)}`;
        if (!LocalEdgeCore_exposureIsPort(listener.port)) {
            problems.push(`${label} is not a valid TCP port`);
            continue;
        }
        if (manifest.protectedPorts.includes(listener.port)) {
            problems.push(`${label} is protected`);
        }
        if (seen.has(listener.port)) {
            problems.push(`${label} is listed twice`);
        }
        if (appPorts.has(listener.port)) {
            problems.push(`${label} is also an app port`);
        }
        if (listener.clientPort !== undefined && !LocalEdgeCore_exposureIsPort(listener.clientPort)) {
            problems.push(`${label} has an invalid clientPort ${String(listener.clientPort)}`);
        }
        seen.add(listener.port);
    }
    if (!seen.has(settings.routerPort)) {
        problems.push(`hostnames.listeners must include routerPort ${String(settings.routerPort)}`);
    }
    return problems;
}
/** Parses `host:port`; null when it is not one. */
function LocalEdgeCore_parseUpstream(value) {
    const match = /^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\]):(\d{1,5})$/.exec(value);
    if (!match) {
        return null;
    }
    const port = Number(match[2]);
    return LocalEdgeCore_exposureIsPort(port) ? { host: match[1] ?? "", port } : null;
}
/** Checks the stream router: loopback port of its own, valid routes and upstreams. */
function LocalEdgeCore_streamProblems(manifest, settings) {
    const { stream } = settings;
    if (stream === undefined) {
        return [];
    }
    const problems = [];
    const label = `hostnames.stream port ${String(stream.port)}`;
    if (!LocalEdgeCore_exposureIsPort(stream.port)) {
        problems.push(`${label} is not a valid TCP port`);
    }
    else {
        if (manifest.protectedPorts.includes(stream.port)) {
            problems.push(`${label} is protected`);
        }
        if (LocalEdgeCore_routerListeners(settings).some((listener) => listener.port === stream.port)) {
            problems.push(`${label} is also an HTTP listener`);
        }
        if (LocalEdgeCore_appPorts(manifest).has(stream.port)) {
            problems.push(`${label} is also an app port`);
        }
    }
    const upstreams = [
        ...stream.routes.map((route) => ({ what: `route ${route.serverName}`, value: route.upstream })),
        { what: "default", value: stream.defaultUpstream },
    ];
    for (const { what, value } of upstreams) {
        const upstream = LocalEdgeCore_parseUpstream(value);
        if (upstream === null) {
            problems.push(`hostnames.stream ${what} upstream "${value}" must be host:port`);
        }
        else if (upstream.host === LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST && upstream.port === stream.port) {
            problems.push(`hostnames.stream ${what} upstream points back at the stream listener`);
        }
    }
    const keys = new Set();
    for (const route of stream.routes) {
        if (!/^[^\s;{}'"#]+$/.test(route.serverName) || route.serverName === "default") {
            problems.push(`hostnames.stream route "${route.serverName}" is not a usable map key`);
        }
        if (keys.has(route.serverName)) {
            problems.push(`hostnames.stream route "${route.serverName}" is listed twice`);
        }
        keys.add(route.serverName);
    }
    if (stream.connectTimeout !== undefined && !/^\d+(ms|s|m)?$/.test(stream.connectTimeout)) {
        problems.push(`hostnames.stream connectTimeout "${stream.connectTimeout}" is not an nginx time`);
    }
    return problems;
}
/** Renders the `listen` line for one listener. */
function LocalEdgeCore_renderListen(settings, listener, suffix) {
    return `listen ${settings.routerHost}:${String(listener.port)}${listener.ssl ? " ssl" : ""}${suffix};`;
}
/** `X-Forwarded-Host` value for one client port. */
function LocalEdgeCore_forwardedHostFor(clientPort) {
    return clientPort === 443 ? "$host" : `$host:${String(clientPort)}`;
}
/**
 * The `X-Forwarded-Host` and `X-Forwarded-Port` values. With one client port they are literals;
 * with several, maps on `$server_port` pick the client port of the listener that took the request.
 */
function LocalEdgeCore_forwardedValues(listeners) {
    const clientPorts = [...new Set(listeners.map((listener) => listener.clientPort))];
    const [only] = clientPorts;
    if (clientPorts.length === 1 && only !== undefined) {
        return { host: LocalEdgeCore_forwardedHostFor(only), port: String(only), maps: [] };
    }
    const map = (variable, value) => [
        `  map $server_port ${variable} {`,
        ...listeners.map((listener) => `    ${String(listener.port)} ${value(listener.clientPort)};`),
        "  }",
    ];
    return {
        host: "$local_edge_forwarded_host",
        port: "$local_edge_forwarded_port",
        maps: [
            ...map("$local_edge_forwarded_host", LocalEdgeCore_forwardedHostFor),
            ...map("$local_edge_forwarded_port", (clientPort) => String(clientPort)),
        ],
    };
}
/** Renders the `stream` block, or nothing when no stream router is configured. */
function LocalEdgeCore_renderStreamBlock(settings) {
    const { stream } = settings;
    if (stream === undefined) {
        return [];
    }
    return [
        "stream {",
        "  map $ssl_preread_server_name $local_edge_stream_upstream {",
        ...stream.routes.map((route) => `    ${route.serverName} ${route.upstream};`),
        `    default ${stream.defaultUpstream};`,
        "  }",
        "  server {",
        `    listen ${settings.routerHost}:${String(stream.port)};`,
        "    ssl_preread on;",
        "    proxy_pass $local_edge_stream_upstream;",
        `    proxy_connect_timeout ${stream.connectTimeout ?? "5s"};`,
        "  }",
        "}",
    ];
}
/** Renders one proxy `location` with the shared headers. */
function LocalEdgeCore_renderHostLocation(options) {
    return `    location ${options.path} {
      proxy_pass http://${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}:${String(options.localPort)}${options.upstreamPath};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Host ${options.forwardedHost};
      proxy_set_header X-Forwarded-Port ${options.forwardedPort};
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $local_edge_connection_upgrade;
      proxy_read_timeout 300s;
    }`;
}
/**
 * Renders the server block for one host: one `listen` per router listener, `server_name` set to
 * the host, `/` to the app's loopback port plus any extra path locations, each proxied with
 * HTTP/1.1, the original Host, `X-Forwarded-Proto https`, `X-Forwarded-Host` and
 * `X-Forwarded-Port` with the client-facing port, and Upgrade/Connection passed for websockets.
 */
function LocalEdgeCore_renderHostServerBlock(settings, entry) {
    const listeners = LocalEdgeCore_routerListeners(settings);
    const { host: forwardedHost, port: forwardedPort } = LocalEdgeCore_forwardedValues(listeners);
    const locations = [
        LocalEdgeCore_renderHostLocation({
            path: "/",
            localPort: entry.localPort,
            upstreamPath: "",
            forwardedHost,
            forwardedPort,
        }),
        ...entry.locations.map((location) => LocalEdgeCore_renderHostLocation({
            path: location.path,
            localPort: location.localPort,
            upstreamPath: location.upstreamPath ?? location.path,
            forwardedHost,
            forwardedPort,
        })),
    ];
    const listens = listeners.map((listener) => `    ${LocalEdgeCore_renderListen(settings, listener, "")}`);
    return `  server {
${listens.join("\n")}
    http2 on;
    server_name ${entry.host};
${locations.join("\n")}
  }`;
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
 * Renders the whole router `nginx.conf`: pid, logs and temp paths from config, an optional SNI
 * stream router, the certificate at http level, a default server on every listener that answers
 * 421 for unknown names, and one SNI server block per enabled app. Pure and deterministic, so a supervisor can compare it with the file on disk.
 * Throws when the settings or names are invalid.
 *
 * @param manifest - Manifest with `hostnames` settings.
 * @returns The complete `nginx.conf` text.
 * @throws `local-edge-core-hostnames-invalid` with every problem when validation fails; every path is
 *   also re-checked by `LocalEdgeCore_nginxPathArgument` while rendering.
 * @example
 * ```typescript
 * const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest);
 * if (text !== fs.readFileSync(confPath, "utf8")) { writeAndTest(text); } // write it, then nginx -t
 * ```
 */
export function LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest) {
    const settings = LocalEdgeCore_requireValidHostnames(manifest);
    const { nginx } = settings;
    const listeners = LocalEdgeCore_routerListeners(settings);
    const arg = LocalEdgeCore_nginxPathArgument;
    const temp = (directive, name) => `  ${directive}_temp_path ${arg("hostnames.nginx.tempDir", path.join(nginx.tempDir, name))};`;
    return [
        "# Generated by the local-edge hostnames backend. Do not edit: changes are overwritten.",
        "worker_processes 1;",
        `pid ${arg("hostnames.nginx.pidPath", nginx.pidPath)};`,
        `error_log ${arg("hostnames.nginx.errorLogPath", nginx.errorLogPath)} warn;`,
        `events { worker_connections ${String(nginx.workerConnections ?? 512)}; }`,
        ...LocalEdgeCore_renderStreamBlock(settings),
        "http {",
        ...(nginx.mimeTypesPath === undefined ? [] : [`  include ${arg("hostnames.nginx.mimeTypesPath", nginx.mimeTypesPath)};`]),
        "  default_type application/octet-stream;",
        `  access_log ${arg("hostnames.nginx.accessLogPath", nginx.accessLogPath)};`,
        temp("client_body", "body"),
        temp("proxy", "proxy"),
        temp("fastcgi", "fcgi"),
        temp("uwsgi", "uwsgi"),
        temp("scgi", "scgi"),
        "  server_names_hash_bucket_size 128;",
        `  ssl_certificate ${arg("hostnames.tls.certPath", settings.tls.certPath)};`,
        `  ssl_certificate_key ${arg("hostnames.tls.keyPath", settings.tls.keyPath)};`,
        "  ssl_protocols TLSv1.2 TLSv1.3;",
        "  map $http_upgrade $local_edge_connection_upgrade { default upgrade; '' close; }",
        ...LocalEdgeCore_forwardedValues(listeners).maps,
        `  server { ${listeners.map((listener) => LocalEdgeCore_renderListen(settings, listener, " default_server")).join(" ")} server_name _; return 421; }`,
        ...LocalEdgeCore_listExposureHostnames(manifest, settings).map((entry) => LocalEdgeCore_renderHostServerBlock(settings, entry)),
        "}",
        "",
    ].join("\n");
}
/**
 * Reads the node's tailnet addresses from `tailscale status --json`. Read-only.
 *
 * @param runner - Command runner (tests pass a fake).
 * @param tailscaleBin - CLI binary.
 * @returns The first IPv4 and IPv6 of `Self.TailscaleIPs`; `{}` when the command fails or its output is unreadable.
 * @example
 * ```typescript
 * LocalEdgeCore_readTailnetAddresses(LocalEdgeCore_exposureDefaultCommandRunner, "tailscale"); // { ipv4: "192.0.2.9" }
 * ```
 */
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
/**
 * Lists why a folder is not private (0700) and outside any git checkout. Empty means fine.
 *
 * @param dir - Folder to check.
 * @param probe - Folder probe; `LocalEdgeCore_inspectPrivateDir` reads the real file system.
 * @example
 * ```typescript
 * LocalEdgeCore_privateDirProblems("/srv/edge/tls", LocalEdgeCore_inspectPrivateDir); // [] when 0700 and outside git
 * ```
 */
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
/**
 * Builds every planned action for the hostname backend. Reads only (status JSON, folder modes).
 *
 * @param manifest - Manifest with `hostnames` settings.
 * @param options - Runner, binaries and folder probe.
 * @returns One `refuse` per enabled app (and nothing else) when validation fails; otherwise one
 *   `manual` server-block action per enabled app followed by the router, TLS, ACME, DNS, stream
 *   and tailnet steps. Runs `tailscale status --json` only when `addresses` is not configured.
 * @example
 * ```typescript
 * for (const action of LocalEdgeCore_planExposureHostnames(manifest)) console.log(action.appId, action.kind);
 * ```
 */
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
    const wildcards = LocalEdgeCore_buildExposureHostnamesWildcards(settings);
    const wildcard = wildcards.join(", ");
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
            edgeUrl: LocalEdgeCore_hostnamesEdgeUrl(entry.host, LocalEdgeCore_clientEdgePort(settings)),
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
                domains: wildcards,
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
    const records = wildcards.flatMap((each) => {
        const recordName = each.slice(0, each.length - settings.rootZone.length - 1);
        return [
            `${recordName} A ${addresses.ipv4 ?? "<tailnet IPv4>"}`,
            ...(addresses.ipv6 ? [`${recordName} AAAA ${addresses.ipv6}`] : []),
        ];
    });
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
    if (settings.stream !== undefined) {
        const { stream } = settings;
        actions.push({
            appId: "router:stream",
            kind: "manual",
            requires: "none",
            target: `${settings.routerHost}:${String(stream.port)}`,
            reason: `SNI stream router on ${settings.routerHost}:${String(stream.port)} in the same nginx; pointing a tailnet port at it is an owner step, never applied by this backend`,
            detail: [
                ...stream.routes.map((route) => `${route.serverName} -> ${route.upstream}`),
                `default -> ${stream.defaultUpstream}`,
            ].join("\n"),
        });
    }
    if (settings.tailnetTcp !== false) {
        actions.push({
            appId: "router:tailnet",
            kind: "manual",
            requires: "none",
            target: routerTarget,
            reason: "raw TCP so TLS and SNI reach the router; a go-live step, never applied by this backend",
            argv: [tailscaleBin, "serve", "--bg", `--tcp=${String(LocalEdgeCore_clientEdgePort(settings))}`, `tcp://${routerTarget}`],
        });
    }
    return actions;
}
/**
 * Observes the Serve TCP mapping in front of the router, read-only, from `serve status --json`:
 * `exposed` when the edge port forwards to the router, `missing` when the port is unmapped, and
 * `conflict` when it is mapped to anything else.
 *
 * @param settings - Hostname settings.
 * @param runner - Command runner.
 * @param tailscaleBin - CLI binary.
 * @returns `unknown` when status cannot be read, otherwise `exposed`, `missing` or `conflict` with a note.
 * @example
 * ```typescript
 * LocalEdgeCore_observeHostnamesServeTcp(settings, runner, "tailscale").state; // "exposed" | "missing" | ...
 * ```
 */
export function LocalEdgeCore_observeHostnamesServeTcp(settings, runner, tailscaleBin) {
    const edgePort = String(LocalEdgeCore_clientEdgePort(settings));
    const want = `${settings.routerHost}:${String(settings.routerPort)}`;
    let parsed;
    try {
        const result = runner(tailscaleBin, ["serve", "status", "--json"]);
        if (result.status !== 0) {
            return { state: "unknown", observed: null, note: "serve status unavailable" };
        }
        parsed = JSON.parse(result.stdout.trim() === "" ? "{}" : result.stdout);
    }
    catch {
        return { state: "unknown", observed: null, note: "serve status unreadable" };
    }
    const tcp = parsed?.TCP ?? {};
    const entry = tcp[edgePort];
    if (entry === undefined) {
        return { state: "missing", observed: null, note: `serve :${edgePort} is not mapped` };
    }
    if (entry.TCPForward === want) {
        return { state: "exposed", observed: `tcp://${want}`, note: `serve :${edgePort} tcp forward to ${want} matches` };
    }
    const observed = typeof entry.TCPForward === "string" ? `tcp://${entry.TCPForward}` : entry.HTTPS === true ? "https" : null;
    return { state: "conflict", observed, note: `serve :${edgePort} is mapped to something else` };
}
/**
 * Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse.
 *
 * @param options - Runner, binaries and folder probe, passed to the planner and status.
 * @returns A backend whose `plan` lists the steps, whose `planRemove` tells the operator to disable
 *   apps in config, whose `status` reads the Serve TCP mapping, and whose `apply`/`remove` refuse.
 * @example
 * ```typescript
 * const backend = LocalEdgeCore_createHostnamesBackend();
 * process.stdout.write(LocalEdgeCore_renderExposurePlanText(backend.plan(manifest)));
 * ```
 */
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
    const edgeUrlFor = (manifest, appName, appTemplate) => {
        if (!manifest.hostnames) {
            return null;
        }
        try {
            return LocalEdgeCore_hostnamesEdgeUrl(LocalEdgeCore_buildExposureHostname(manifest.hostnames, appName, appTemplate), LocalEdgeCore_clientEdgePort(manifest.hostnames));
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
        status: (manifest) => {
            const serve = manifest.hostnames
                ? LocalEdgeCore_observeHostnamesServeTcp(manifest.hostnames, options.runner ?? LocalEdgeCore_exposureDefaultCommandRunner, options.tailscaleBin ?? "tailscale")
                : { state: "unknown", observed: null, note: "hostnames settings are missing" };
            return manifest.apps.map((app) => ({
                appId: app.id,
                state: app.enabled ? serve.state : "disabled",
                edgeUrl: app.enabled ? edgeUrlFor(manifest, app.edgeName ?? app.id, app.hostnameTemplate) : null,
                target: LocalEdgeCore_exposureTargetUrl(app.localPort),
                observedTarget: app.enabled ? serve.observed : null,
                note: app.enabled ? serve.note : "app is disabled",
            }));
        },
    };
}
