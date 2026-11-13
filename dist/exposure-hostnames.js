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
import { isIPv6 } from "node:net";
import path from "node:path";
import { LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST, LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureDefaultCommandRunner, LocalEdgeCore_exposureIsPort, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
import { LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH, LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH, LocalEdgeCore_checkDnsLabel, LocalEdgeCore_checkHostnameLabels, LocalEdgeCore_renderHostnameTemplate, LocalEdgeCore_sanitizeRealmSlug, } from "./hostname.js";
import { LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE, LocalEdgeCore_messageAppLabel, LocalEdgeCore_messageInputSize, LocalEdgeCore_messageQuoted, LocalEdgeCore_messageNumber, } from "./safe-message.js";
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
 * The host of one app: its exact `host`, else its own pattern, else the settings' pattern.
 *
 * @param settings - Hostname settings.
 * @param app - The app's id, edge name, own pattern and exact host.
 * @returns The host the router serves the app under.
 * @throws When a pattern cannot be built.
 * @example
 * ```typescript
 * LocalEdgeCore_exposureAppHost(settings, { id: "play", host: "play.node1.example.test" }); // "play.node1.example.test"
 * ```
 */
export function LocalEdgeCore_exposureAppHost(settings, app) {
    return app.host ?? LocalEdgeCore_buildExposureHostname(settings, app.edgeName ?? app.id, app.hostnameTemplate);
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
            host: LocalEdgeCore_exposureAppHost(settings, app),
            localPort: app.localPort,
            locations: app.locations ?? [],
            proxy: app.proxy ?? {},
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
 * @returns `null` when the path is safe to write unquoted, otherwise the problem. The problem names
 *   the field, the rule and the length, and never contains any part of the path.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_nginxPathProblem("hostnames.nginx.pidPath", "/srv/edge/nginx.pid"); // null
 * LocalEdgeCore_nginxPathProblem("hostnames.nginx.pidPath", "/srv/x.pid;\nuser root"); // problem text, no part of the path
 * ```
 */
export function LocalEdgeCore_nginxPathProblem(field, value) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
        return `${field} must be an absolute path`;
    }
    if (LOCAL_EDGE_CORE_NGINX_UNSAFE_ARGUMENT.test(value)) {
        return `${field} (${LocalEdgeCore_messageInputSize(value)}) has a character nginx reads as syntax (whitespace, a quote, ; { } # $ \\ or a control character)`;
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
/** A URL path an app location may use: starts with `/`, then URL path characters only. */
const LOCAL_EDGE_CORE_URL_PATH = /^\/[A-Za-z0-9._~\/-]*$/;
/** Longest location path a message will repeat. */
const LOCAL_EDGE_CORE_LOCATION_LABEL_MAX_LENGTH = 64;
/** Names a location in a message: its path once the path passed the URL path check, else its position. */
function LocalEdgeCore_locationLabel(locationPath, index) {
    return typeof locationPath === "string" &&
        locationPath.length <= LOCAL_EDGE_CORE_LOCATION_LABEL_MAX_LENGTH &&
        LOCAL_EDGE_CORE_URL_PATH.test(locationPath)
        ? locationPath
        : `locations[${String(index)}]`;
}
/**
 * Message for a host that could not be built. Our own errors (`local-edge-core-...`) are repeated
 * because they never contain raw input; anything else, such as an error thrown by a `buildHostname`
 * function from config, is not.
 */
function LocalEdgeCore_hostBuildProblem(error) {
    return error instanceof Error && error.message.startsWith("local-edge-core-")
        ? error.message
        : "the host could not be built (the hostname pattern failed)";
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
        problems.push(`hostnames.rootZone (${LocalEdgeCore_messageInputSize(settings.rootZone)}) must have at least two labels`);
    }
    problems.push(...LocalEdgeCore_checkHostnameLabels(settings.rootZone).map((p) => `hostnames.rootZone: ${p}`));
    if (LocalEdgeCore_sanitizeRealmSlug(settings.realm).length === 0) {
        problems.push(`hostnames.realm (${LocalEdgeCore_messageInputSize(settings.realm)}) has no usable characters`);
    }
    if (settings.routerHost !== LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST) {
        problems.push(`hostnames.routerHost must be ${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}`);
    }
    if (!LocalEdgeCore_exposureIsPort(settings.routerPort)) {
        problems.push(`hostnames.routerPort ${LocalEdgeCore_messageNumber(settings.routerPort)} is not a valid TCP port`);
    }
    else if (manifest.protectedPorts.includes(settings.routerPort)) {
        problems.push(`hostnames.routerPort ${String(settings.routerPort)} is protected`);
    }
    if (settings.edgePort !== undefined) {
        if (!LocalEdgeCore_exposureIsPort(settings.edgePort)) {
            problems.push(`hostnames.edgePort ${LocalEdgeCore_messageNumber(settings.edgePort)} is not a valid TCP port`);
        }
        else if (manifest.protectedPorts.includes(settings.edgePort)) {
            problems.push(`hostnames.edgePort ${String(settings.edgePort)} is protected`);
        }
    }
    const workers = settings.nginx.workerConnections;
    if (workers !== undefined && !(Number.isInteger(workers) && workers >= 1 && workers <= 1_048_576)) {
        problems.push(`hostnames.nginx.workerConnections ${LocalEdgeCore_messageNumber(workers)} is not a positive integer`);
    }
    problems.push(...LocalEdgeCore_pathProblems(settings));
    if (settings.acme && LOCAL_EDGE_CORE_LEGO_DNS_PROVIDER_ENV_NAMES[settings.acme.dnsProvider] === undefined) {
        problems.push(`hostnames.acme.dnsProvider ${LocalEdgeCore_messageQuoted(settings.acme.dnsProvider, LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE)} has no known env names`);
    }
    const wildcards = LocalEdgeCore_buildExposureHostnamesWildcards(settings);
    // The wildcards are named in later messages only when every one of them passed the label checks.
    let wildcardsChecked = labelProblem === null;
    const rootZoneChecked = settings.rootZone.includes(".") && LocalEdgeCore_checkHostnameLabels(settings.rootZone).length === 0;
    const rootZoneName = rootZoneChecked ? settings.rootZone : "<rootZone>";
    for (const [index, wildcard] of wildcards.entries()) {
        const wildcardProblems = LocalEdgeCore_checkHostnameLabels(wildcard);
        problems.push(...wildcardProblems);
        if (wildcardProblems.length > 0) {
            wildcardsChecked = false;
        }
        if (!wildcard.startsWith("*.") || !wildcard.endsWith(`.${settings.rootZone}`)) {
            wildcardsChecked = false;
            problems.push(`hostnames wildcard ${String(index + 1)} of ${String(wildcards.length)} (${LocalEdgeCore_messageInputSize(wildcard)}) must be *.<label>.${rootZoneName}`);
        }
    }
    const wildcardNames = wildcardsChecked ? wildcards.join(" or ") : "the configured wildcard";
    const wildcardParents = new Set(wildcards.map((wildcard) => wildcard.replace(/^\*\./, "")));
    problems.push(...LocalEdgeCore_listenerProblems(manifest, settings));
    problems.push(...LocalEdgeCore_streamProblems(manifest, settings));
    problems.push(...LocalEdgeCore_proxyProtocolProblems(manifest, settings));
    const seen = new Map();
    for (const [appIndex, app] of manifest.apps.entries()) {
        if (!app.enabled) {
            continue;
        }
        // The id is named only if it passes the app id shape; otherwise the app is named by position.
        const who = LocalEdgeCore_messageAppLabel(app.id, appIndex);
        if (app.localPort === settings.routerPort) {
            problems.push(`${who}: local port equals the router port`);
        }
        problems.push(...LocalEdgeCore_proxyOptionProblems(`${who}: location /`, app.proxy ?? {}));
        const paths = new Set();
        for (const [locationIndex, location] of (app.locations ?? []).entries()) {
            const where = `${who}: location ${LocalEdgeCore_locationLabel(location.path, locationIndex)}`;
            problems.push(...LocalEdgeCore_proxyOptionProblems(where, location));
            for (const [field, value] of [["path", location.path], ["upstreamPath", location.upstreamPath]]) {
                if (field === "upstreamPath" && value === "") {
                    continue;
                }
                if (value !== undefined && !LOCAL_EDGE_CORE_URL_PATH.test(value)) {
                    problems.push(`${who}: location ${field} (${LocalEdgeCore_messageInputSize(value)}) must start with / and use only URL path characters`);
                }
            }
            if (location.path === "/" || paths.has(location.path)) {
                problems.push(`${where} is duplicated`);
            }
            paths.add(location.path);
            if (!LocalEdgeCore_exposureIsPort(location.localPort) || location.localPort === settings.routerPort) {
                problems.push(`${where} port ${LocalEdgeCore_messageNumber(location.localPort)} is not a valid upstream port`);
            }
        }
        if (app.host !== undefined) {
            const hostProblem = LocalEdgeCore_nginxValueProblem(`${who}: host`, "host", app.host);
            if (hostProblem !== null) {
                problems.push(hostProblem);
                continue;
            }
        }
        let host;
        try {
            host = LocalEdgeCore_exposureAppHost(settings, app);
        }
        catch (error) {
            problems.push(`${who}: ${LocalEdgeCore_hostBuildProblem(error)}`);
            continue;
        }
        const hostProblems = LocalEdgeCore_checkHostnameLabels(host);
        problems.push(...hostProblems.map((p) => `${who}: ${p}`));
        // An exact `host` already passed the value check above. A built host is named only if it passes the label checks.
        const hostName = app.host !== undefined || hostProblems.length === 0 ? host : `<${LocalEdgeCore_messageInputSize(host)}>`;
        const [left, ...restLabels] = host.split(".");
        if (left === "*" || !wildcardParents.has(restLabels.join("."))) {
            problems.push(`${who}: ${hostName} is not directly under ${wildcardNames}`);
        }
        const other = seen.get(host);
        if (other !== undefined) {
            problems.push(`${who}: ${hostName} is already used by ${LocalEdgeCore_messageAppLabel(other)}`);
        }
        seen.set(host, app.id);
    }
    return problems;
}
/** Longest folder path a message will repeat. Longer paths are described by their length only. */
const LOCAL_EDGE_CORE_PATH_NAME_MAX_LENGTH = 256;
/** Highest valid port. */
const LOCAL_EDGE_CORE_PORT_MAX = 65535;
/**
 * Longest `upstreamHost` accepted: a 253-character DNS name, `:` and a 5-digit port. That is 259
 * characters, far inside the 4096-byte token nginx reads from a config file, so a value that
 * passes can always be loaded.
 */
export const LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH = LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH + 1 + 5;
/** Longest `readTimeout` accepted: seven digits and a two-letter unit (`ms`). */
export const LOCAL_EDGE_CORE_NGINX_READ_TIMEOUT_MAX_LENGTH = 9;
/** One DNS label as written in a `Host` header: letters, digits and `-`, no leading or trailing `-`. */
const LOCAL_EDGE_CORE_UPSTREAM_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
/** Dotted-quad IPv4: four parts, each `0` or 1 to 3 digits without a leading zero, at most 255. */
function LocalEdgeCore_isIpv4(value) {
    const parts = value.split(".");
    return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}
/**
 * Checks the host part of an `upstreamHost`: a DNS name (labels of 1 to 63 letters, digits or
 * `-`, none starting or ending with `-`, no empty label, no leading or trailing dot, at most 253
 * characters), a dotted-quad IPv4, or an IPv6 literal in brackets. A host made only of digits and
 * dots must be a valid IPv4, so `256.0.0.1` is refused rather than read as a name. Unlike
 * `LocalEdgeCore_checkDnsLabel` it accepts upper case and `xn--` labels, which a `Host` header may carry.
 */
function LocalEdgeCore_upstreamHostProblem(host) {
    if (host.startsWith("[")) {
        const literal = host.slice(1, -1);
        return host.endsWith("]") && /^[0-9A-Fa-f:.]+$/.test(literal) && isIPv6(literal)
            ? null
            : "a valid bracketed IPv6 literal";
    }
    if (/^[0-9.]+$/.test(host)) {
        if (LocalEdgeCore_isIpv4(host)) {
            return null;
        }
        // A bare number such as `0` is not a name either; say what to give instead.
        return /^[0-9]+$/.test(host)
            ? "a host that is not all digits (an all-digit host must be a full dotted IPv4 address with four parts, 0-255, such as 192.0.2.10)"
            : "a valid IPv4 address (four parts, 0-255)";
    }
    if (host.length > LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH) {
        return `a host of at most ${String(LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH)} characters`;
    }
    const labels = host.split(".");
    return labels.every((label) => label.length <= LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH && LOCAL_EDGE_CORE_UPSTREAM_LABEL.test(label))
        ? null
        : `a DNS name (labels of 1-${String(LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH)} letters, digits or -, none starting or ending with -, none empty)`;
}
/** Splits `host[:port]` (the host may be a bracketed IPv6 literal) and checks both halves. */
function LocalEdgeCore_upstreamValueProblem(value) {
    let host = value;
    let port;
    if (value.startsWith("[")) {
        const close = value.indexOf("]");
        if (close !== -1) {
            host = value.slice(0, close + 1);
            const rest = value.slice(close + 1);
            if (rest !== "") {
                if (!rest.startsWith(":")) {
                    return "a host or host:port";
                }
                port = rest.slice(1);
            }
        }
    }
    else {
        const parts = value.split(":");
        if (parts.length > 2) {
            return "a host or host:port (wrap an IPv6 literal in [ ])";
        }
        [host = "", port] = parts;
    }
    if (port !== undefined && !(/^[1-9]\d{0,4}$/.test(port) && Number(port) <= LOCAL_EDGE_CORE_PORT_MAX)) {
        return `a host or host:port with a port from 1 to ${String(LOCAL_EDGE_CORE_PORT_MAX)} (no sign, no leading zero)`;
    }
    const hostProblem = LocalEdgeCore_upstreamHostProblem(host);
    return hostProblem === null ? null : `a host or host:port with ${hostProblem}`;
}
/**
 * Length limit and shape check of each non-path value written into the router config. A shape
 * check returns what the value must be when it does not fit, or `null`.
 */
const LOCAL_EDGE_CORE_NGINX_VALUE_SHAPES = {
    host: {
        maxLength: LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH,
        problem: (value) => (/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value) ? null : "a lowercase DNS name"),
    },
    upstreamHost: {
        maxLength: LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH,
        problem: LocalEdgeCore_upstreamValueProblem,
    },
    readTimeout: {
        maxLength: LOCAL_EDGE_CORE_NGINX_READ_TIMEOUT_MAX_LENGTH,
        problem: (value) => (/^\d{1,7}(?:ms|s|m|h)?$/.test(value) ? null : "an nginx time such as 300s"),
    },
};
/**
 * The one check every non-path value written into the router config goes through (an exact
 * `host`, `upstreamHost`, `readTimeout`): it must be a non-empty string within its length limit,
 * with no character nginx reads as syntax, and it must have the value's shape. No quoting is
 * attempted. `upstreamHost` is a DNS name, IPv4 or bracketed IPv6 literal with an optional port
 * from 1 to 65535, at most `LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH` characters.
 *
 * @param field - Field name used in the message, for example `play: location / upstreamHost`.
 * @param kind - Which value this is.
 * @param value - Value from config.
 * @returns `null` when the value is safe to write unquoted, otherwise the problem. The problem names
 *   the field, the rule and the length, and never contains any part of the value.
 * @example
 * ```typescript
 * LocalEdgeCore_nginxValueProblem("play: location / readTimeout", "readTimeout", "3600s"); // null
 * LocalEdgeCore_nginxValueProblem("play: location / upstreamHost", "upstreamHost", "[::1]:5174"); // null
 * LocalEdgeCore_nginxValueProblem("play: location / upstreamHost", "upstreamHost", "a;\nuser root"); // problem text
 * ```
 */
export function LocalEdgeCore_nginxValueProblem(field, kind, value) {
    if (typeof value !== "string" || value.length === 0) {
        return `${field} must be a non-empty string`;
    }
    const shape = LOCAL_EDGE_CORE_NGINX_VALUE_SHAPES[kind];
    // The value is never echoed: it may be oversized, hold control characters or be a secret that
    // was pasted into the wrong field. The message names the field, the rule and the length.
    const size = `${String(value.length)} character${value.length === 1 ? "" : "s"}`;
    if (LOCAL_EDGE_CORE_NGINX_UNSAFE_ARGUMENT.test(value)) {
        return `${field} (${size}) has a character nginx reads as syntax (whitespace, a quote, ; { } # $ \\ or a control character)`;
    }
    if (value.length > shape.maxLength) {
        return `${field} is ${size}, longer than ${String(shape.maxLength)}`;
    }
    const mustBe = shape.problem(value);
    if (mustBe !== null) {
        return `${field} (${size}) must be ${mustBe}`;
    }
    return null;
}
/**
 * Returns `value` for writing into the router config, or throws, so the renderer stays safe even
 * when called without validation.
 *
 * @param field - Field name used in the error.
 * @param kind - Which value this is.
 * @param value - Value from config.
 * @returns The unchanged value.
 * @throws `local-edge-core-nginx-unsafe-value` when `LocalEdgeCore_nginxValueProblem` reports a problem.
 * @example
 * ```typescript
 * `proxy_read_timeout ${LocalEdgeCore_nginxValueArgument("play: location / readTimeout", "readTimeout", "3600s")};`;
 * ```
 */
export function LocalEdgeCore_nginxValueArgument(field, kind, value) {
    const problem = LocalEdgeCore_nginxValueProblem(field, kind, value);
    if (problem !== null) {
        throw new Error(`local-edge-core-nginx-unsafe-value: ${problem}`);
    }
    return value;
}
/** Checks proxy overrides through the shared value check. */
function LocalEdgeCore_proxyOptionProblems(label, options) {
    const problems = [];
    for (const kind of ["upstreamHost", "readTimeout"]) {
        if (options[kind] !== undefined) {
            const problem = LocalEdgeCore_nginxValueProblem(`${label} ${kind}`, kind, options[kind]);
            if (problem !== null) {
                problems.push(problem);
            }
        }
    }
    if (options.buffering !== undefined && typeof options.buffering !== "boolean") {
        problems.push(`${label} buffering must be true or false`);
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
        const label = `hostnames.listeners port ${LocalEdgeCore_messageNumber(listener.port)}`;
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
            problems.push(`${label} has an invalid clientPort ${LocalEdgeCore_messageNumber(listener.clientPort)}`);
        }
        seen.add(listener.port);
    }
    if (!seen.has(settings.routerPort)) {
        problems.push(`hostnames.listeners must include routerPort ${LocalEdgeCore_messageNumber(settings.routerPort)}`);
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
    const label = `hostnames.stream port ${LocalEdgeCore_messageNumber(stream.port)}`;
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
    // Routes are named by position: a route's server name is raw input until the key check below.
    const upstreams = [
        ...stream.routes.map((route, index) => ({ what: `route ${String(index + 1)}`, value: route.upstream })),
        { what: "default", value: stream.defaultUpstream },
    ];
    for (const { what, value } of upstreams) {
        const upstream = LocalEdgeCore_parseUpstream(value);
        if (upstream === null) {
            problems.push(`hostnames.stream ${what} upstream (${LocalEdgeCore_messageInputSize(value)}) must be host:port`);
        }
        else if (upstream.host === LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST && upstream.port === stream.port) {
            problems.push(`hostnames.stream ${what} upstream points back at the stream listener`);
        }
    }
    const keys = new Map();
    for (const [index, route] of stream.routes.entries()) {
        const routeName = `hostnames.stream route ${String(index + 1)}`;
        if (!/^[^\s;{}'"#]+$/.test(route.serverName) || route.serverName === "default") {
            problems.push(`${routeName} (server name of ${LocalEdgeCore_messageInputSize(route.serverName)}) is not a usable map key`);
        }
        const first = keys.get(route.serverName);
        if (first !== undefined) {
            problems.push(`${routeName} has the same server name as route ${String(first)}`);
        }
        else {
            keys.set(route.serverName, index + 1);
        }
    }
    if (stream.connectTimeout !== undefined && !/^\d+(ms|s|m)?$/.test(stream.connectTimeout)) {
        problems.push(`hostnames.stream connectTimeout (${LocalEdgeCore_messageInputSize(stream.connectTimeout)}) is not an nginx time`);
    }
    return problems;
}
/** The two accepted `clientAddress` modes. */
const LOCAL_EDGE_CORE_CLIENT_ADDRESS_MODES = ["connection", "proxy-protocol"];
/** The `proxy-protocol` mode of a validated config, or null when the config uses the connection address. */
function LocalEdgeCore_proxyProtocolMode(settings) {
    const { stream, proxyProtocol } = settings;
    if (settings.clientAddress !== "proxy-protocol" || stream === undefined || proxyProtocol === undefined) {
        return null;
    }
    const firstRoute = stream.routes[0] === undefined ? null : LocalEdgeCore_parseUpstream(stream.routes[0].upstream);
    const target = LocalEdgeCore_routerListeners(settings).find((listener) => listener.port === firstRoute?.port);
    return {
        stream,
        ports: proxyProtocol,
        clientPort: proxyProtocol.httpClientPort ?? target?.clientPort ?? LocalEdgeCore_clientEdgePort(settings),
    };
}
/**
 * Checks `clientAddress` and, for `proxy-protocol`, the stream router it builds on and the three
 * extra loopback ports (valid, unprotected, distinct from each other and from every other port).
 */
function LocalEdgeCore_proxyProtocolProblems(manifest, settings) {
    const { clientAddress, proxyProtocol } = settings;
    if (clientAddress === undefined || clientAddress === "connection") {
        return proxyProtocol === undefined ? [] : ["hostnames.proxyProtocol is only used when clientAddress is proxy-protocol"];
    }
    if (!LOCAL_EDGE_CORE_CLIENT_ADDRESS_MODES.includes(clientAddress)) {
        return [`hostnames.clientAddress (${LocalEdgeCore_messageInputSize(clientAddress)}) must be connection or proxy-protocol`];
    }
    const problems = [];
    const { stream } = settings;
    if (stream === undefined) {
        problems.push("hostnames.clientAddress proxy-protocol needs hostnames.stream");
    }
    if (proxyProtocol === undefined) {
        problems.push("hostnames.clientAddress proxy-protocol needs hostnames.proxyProtocol ports");
        return problems;
    }
    const taken = new Map();
    for (const listener of LocalEdgeCore_routerListeners(settings)) {
        taken.set(listener.port, "an HTTP listener");
    }
    for (const port of LocalEdgeCore_appPorts(manifest)) {
        taken.set(port, "an app port");
    }
    if (stream !== undefined) {
        taken.set(stream.port, "the stream router port");
    }
    for (const field of ["streamPort", "httpPort", "relayPort"]) {
        const port = proxyProtocol[field];
        const label = `hostnames.proxyProtocol.${field} ${LocalEdgeCore_messageNumber(port)}`;
        if (!LocalEdgeCore_exposureIsPort(port)) {
            problems.push(`${label} is not a valid TCP port`);
            continue;
        }
        if (manifest.protectedPorts.includes(port)) {
            problems.push(`${label} is protected`);
        }
        const owner = taken.get(port);
        if (owner !== undefined) {
            problems.push(`${label} is already used as ${owner}`);
        }
        taken.set(port, `hostnames.proxyProtocol.${field}`);
    }
    if (proxyProtocol.httpClientPort !== undefined && !LocalEdgeCore_exposureIsPort(proxyProtocol.httpClientPort)) {
        problems.push(`hostnames.proxyProtocol.httpClientPort ${LocalEdgeCore_messageNumber(proxyProtocol.httpClientPort)} is not a valid TCP port`);
    }
    if (stream !== undefined) {
        const listenerPorts = new Set(LocalEdgeCore_routerListeners(settings).map((listener) => listener.port));
        for (const [index, route] of stream.routes.entries()) {
            const upstream = LocalEdgeCore_parseUpstream(route.upstream);
            if (upstream === null || upstream.host !== settings.routerHost || !listenerPorts.has(upstream.port)) {
                problems.push(`hostnames.stream route ${String(index + 1)} must point at a router listener when clientAddress is proxy-protocol, because the relay serves only the default upstream`);
            }
        }
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
/**
 * Every HTTP listener that proxies requests: the configured ones plus, in `proxy-protocol` mode,
 * the extra PROXY protocol listener (with the client port the forwarded host and port maps use).
 */
function LocalEdgeCore_httpListeners(settings) {
    const mode = LocalEdgeCore_proxyProtocolMode(settings);
    const listeners = LocalEdgeCore_routerListeners(settings);
    return mode === null ? listeners : [...listeners, { port: mode.ports.httpPort, ssl: true, clientPort: mode.clientPort }];
}
/** The `listen` line of the extra PROXY protocol HTTP listener, as a list of zero or one entries. */
function LocalEdgeCore_proxyProtocolHttpListens(settings, suffix) {
    const mode = LocalEdgeCore_proxyProtocolMode(settings);
    return mode === null ? [] : [`    listen ${settings.routerHost}:${String(mode.ports.httpPort)} ssl proxy_protocol${suffix};`];
}
/** Plan detail lines for the extra PROXY protocol listeners; none in `connection` mode. */
function LocalEdgeCore_proxyProtocolPlanLines(settings) {
    const mode = LocalEdgeCore_proxyProtocolMode(settings);
    if (mode === null) {
        return [];
    }
    const { ports } = mode;
    const host = settings.routerHost;
    return [
        `proxy protocol: stream ${host}:${String(ports.streamPort)} (app names -> ${host}:${String(ports.httpPort)} with PROXY protocol, others -> relay ${host}:${String(ports.relayPort)} -> default upstream, plain)`,
    ];
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
        ...LocalEdgeCore_renderProxyProtocolStreamServers(settings),
        "}",
    ];
}
/**
 * The extra stream servers of `proxy-protocol` mode, appended after the existing stream server
 * (which is left as it is): a PROXY protocol listener with the same SNI routes that sends the
 * client address on to its upstreams, and a relay that reads the header and forwards plain to the
 * default upstream (which does not accept the PROXY protocol).
 */
function LocalEdgeCore_renderProxyProtocolStreamServers(settings) {
    const mode = LocalEdgeCore_proxyProtocolMode(settings);
    if (mode === null) {
        return [];
    }
    const { stream, ports } = mode;
    const timeout = `    proxy_connect_timeout ${stream.connectTimeout ?? "5s"};`;
    return [
        "  map $ssl_preread_server_name $local_edge_stream_proxy_protocol_upstream {",
        ...stream.routes.map((route) => `    ${route.serverName} ${settings.routerHost}:${String(ports.httpPort)};`),
        `    default ${settings.routerHost}:${String(ports.relayPort)};`,
        "  }",
        "  server {",
        `    listen ${settings.routerHost}:${String(ports.streamPort)} proxy_protocol;`,
        `    set_real_ip_from ${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST};`,
        "    ssl_preread on;",
        "    proxy_pass $local_edge_stream_proxy_protocol_upstream;",
        "    proxy_protocol on;",
        timeout,
        "  }",
        "  server {",
        `    listen ${settings.routerHost}:${String(ports.relayPort)} proxy_protocol;`,
        `    proxy_pass ${stream.defaultUpstream};`,
        timeout,
        "  }",
    ];
}
/**
 * `log_format` of the access log. It has no client address, no query string (`$uri`, not
 * `$request`) and no header values: time, host, method, path, protocol, status, bytes sent and
 * request time.
 */
const LOCAL_EDGE_CORE_ACCESS_LOG_FORMAT = "$time_iso8601 $host $request_method $uri $server_protocol $status $body_bytes_sent $request_time";
/** Renders one proxy `location` with the shared headers. */
function LocalEdgeCore_renderHostLocation(options) {
    const buffering = options.proxy.buffering === false ? "\n      proxy_buffering off;" : "";
    return `    location ${options.path} {
      proxy_pass http://${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}:${String(options.localPort)}${options.upstreamPath};
      proxy_http_version 1.1;
      proxy_set_header Host ${options.proxy.upstreamHost === undefined ? "$host" : LocalEdgeCore_nginxValueArgument(`location ${options.path} upstreamHost`, "upstreamHost", options.proxy.upstreamHost)};
      proxy_set_header X-Forwarded-For $local_edge_client_addr;
      proxy_set_header X-Real-IP $local_edge_client_addr;
      proxy_set_header X-Real-Port $local_edge_client_port;
      proxy_set_header Forwarded "";
      proxy_set_header X-Client-IP "";
      proxy_set_header True-Client-IP "";
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Host ${options.forwardedHost};
      proxy_set_header X-Forwarded-Port ${options.forwardedPort};
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $local_edge_connection_upgrade;${buffering}
      proxy_read_timeout ${options.proxy.readTimeout === undefined ? "300s" : LocalEdgeCore_nginxValueArgument(`location ${options.path} readTimeout`, "readTimeout", options.proxy.readTimeout)};
    }`;
}
/**
 * Renders the server block for one host: one `listen` per router listener, `server_name` set to
 * the host, `/` to the app's loopback port plus any extra path locations, each proxied with
 * HTTP/1.1, the original Host, `X-Forwarded-For` and `X-Real-IP` set (never appended) to the
 * client address, `X-Real-Port` to the client source port, client-sent `Forwarded`,
 * `X-Client-IP` and `True-Client-IP` cleared, `X-Forwarded-Proto https`, `X-Forwarded-Host` and
 * `X-Forwarded-Port` with the client-facing port, and Upgrade/Connection passed for websockets.
 */
function LocalEdgeCore_renderHostServerBlock(settings, entry) {
    const listeners = LocalEdgeCore_httpListeners(settings);
    const { host: forwardedHost, port: forwardedPort } = LocalEdgeCore_forwardedValues(listeners);
    const locations = [
        LocalEdgeCore_renderHostLocation({
            path: "/",
            localPort: entry.localPort,
            upstreamPath: "",
            forwardedHost,
            forwardedPort,
            proxy: entry.proxy,
        }),
        ...entry.locations.map((location) => LocalEdgeCore_renderHostLocation({
            path: location.path,
            localPort: location.localPort,
            upstreamPath: location.upstreamPath ?? location.path,
            forwardedHost,
            forwardedPort,
            proxy: location,
        })),
    ];
    const listens = [
        ...LocalEdgeCore_routerListeners(settings).map((listener) => `    ${LocalEdgeCore_renderListen(settings, listener, "")}`),
        ...LocalEdgeCore_proxyProtocolHttpListens(settings, ""),
    ];
    return `  server {
${listens.join("\n")}
    http2 on;
    server_name ${LocalEdgeCore_nginxValueArgument(`${entry.appId}: host`, "host", entry.host)};
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
    const listeners = LocalEdgeCore_httpListeners(settings);
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
        `  log_format local_edge '${LOCAL_EDGE_CORE_ACCESS_LOG_FORMAT}';`,
        `  access_log ${arg("hostnames.nginx.accessLogPath", nginx.accessLogPath)} local_edge;`,
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
        "  map $proxy_protocol_addr $local_edge_client_addr { \"\" $remote_addr; default $proxy_protocol_addr; }",
        "  map $proxy_protocol_port $local_edge_client_port { \"\" $remote_port; default $proxy_protocol_port; }",
        ...LocalEdgeCore_forwardedValues(listeners).maps,
        `  server { ${[
            ...LocalEdgeCore_routerListeners(settings).map((listener) => LocalEdgeCore_renderListen(settings, listener, " default_server")),
            ...LocalEdgeCore_proxyProtocolHttpListens(settings, " default_server").map((line) => line.trim()),
        ].join(" ")} server_name _; return 421; }`,
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
    // The folder is named only once it passed the path check; the git root is one of its parents.
    const named = LocalEdgeCore_nginxPathProblem("dir", dir) === null && dir.length <= LOCAL_EDGE_CORE_PATH_NAME_MAX_LENGTH;
    const dirName = named ? dir : `<folder, ${LocalEdgeCore_messageInputSize(dir)}>`;
    if (!seen.exists) {
        problems.push(`${dirName} does not exist yet; create it with mode 0700`);
    }
    else if (seen.mode !== 0o700) {
        problems.push(`${dirName} is mode ${(seen.mode ?? 0).toString(8)}, want 700`);
    }
    if (seen.gitRoot !== null) {
        problems.push(`${dirName} is inside the git checkout ${named ? seen.gitRoot : "<folder>"}`);
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
                ...LocalEdgeCore_proxyProtocolPlanLines(settings),
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
    const edgeUrlFor = (manifest, app) => {
        if (!manifest.hostnames) {
            return null;
        }
        try {
            return LocalEdgeCore_hostnamesEdgeUrl(LocalEdgeCore_exposureAppHost(manifest.hostnames, app), LocalEdgeCore_clientEdgePort(manifest.hostnames));
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
                edgeUrl: app.enabled ? edgeUrlFor(manifest, app) : null,
                target: LocalEdgeCore_exposureTargetUrl(app.localPort),
                observedTarget: app.enabled ? serve.observed : null,
                note: app.enabled ? serve.note : "app is disabled",
            }));
        },
    };
}
