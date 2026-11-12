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
import { type LocalEdgeCore_ExposureAction, type LocalEdgeCore_ExposureApp, type LocalEdgeCore_ExposureAppLocation, type LocalEdgeCore_ExposureProxyOptions, type LocalEdgeCore_ExposureBackend, type LocalEdgeCore_ExposureCommandRunner, type LocalEdgeCore_ExposureHostnamesConfig, type LocalEdgeCore_ExposureManifest } from "./exposure.js";
/** Backend name for SNI-routed hostnames. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Default hostname template. `{label}` is `<app>` or `<app>--<realm>`. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE = "{label}.{projectMachine}.{rootZone}";
/** Default wildcard template. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD = "*.{projectMachine}.{rootZone}";
/** What the private-folder probe reports for one folder. */
export type LocalEdgeCore_PrivateDirInspection = {
    exists: boolean;
    /** Permission bits, for example 0o700; null when missing. */
    mode: number | null;
    /** The git checkout root that contains the folder, or null. */
    gitRoot: string | null;
};
/** Injectable probe for private folders. */
export type LocalEdgeCore_PrivateDirProbe = (dir: string) => LocalEdgeCore_PrivateDirInspection;
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
export declare const LocalEdgeCore_inspectPrivateDir: LocalEdgeCore_PrivateDirProbe;
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
export declare function LocalEdgeCore_buildExposureHostname(settings: LocalEdgeCore_ExposureHostnamesConfig, app: string, appTemplate?: string): string;
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
export declare function LocalEdgeCore_buildExposureHostnamesWildcard(settings: LocalEdgeCore_ExposureHostnamesConfig): string;
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
export declare function LocalEdgeCore_buildExposureHostnamesWildcards(settings: LocalEdgeCore_ExposureHostnamesConfig): string[];
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
export declare function LocalEdgeCore_sniZoneSuffixPattern(rootZone: string): string;
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
export declare function LocalEdgeCore_hostnamesEdgeUrl(host: string, port: number): string;
/** One enabled app with its host. */
export type LocalEdgeCore_ExposureHostnameEntry = {
    appId: string;
    name: string;
    host: string;
    localPort: number;
    locations: readonly LocalEdgeCore_ExposureAppLocation[];
    /** Proxy overrides for `/`. */
    proxy: LocalEdgeCore_ExposureProxyOptions;
};
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
export declare function LocalEdgeCore_exposureAppHost(settings: LocalEdgeCore_ExposureHostnamesConfig, app: Pick<LocalEdgeCore_ExposureApp, "id" | "edgeName" | "hostnameTemplate" | "host">): string;
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
export declare function LocalEdgeCore_listExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, settings: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ExposureHostnameEntry[];
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
export declare function LocalEdgeCore_nginxPathProblem(field: string, value: string): string | null;
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
export declare function LocalEdgeCore_nginxPathArgument(field: string, value: string): string;
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
export declare function LocalEdgeCore_validateExposureHostnames(manifest: LocalEdgeCore_ExposureManifest): string[];
/**
 * Longest `upstreamHost` accepted: a 253-character DNS name, `:` and a 5-digit port. That is 259
 * characters, far inside the 4096-byte token nginx reads from a config file, so a value that
 * passes can always be loaded.
 */
export declare const LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH: number;
/** Longest `readTimeout` accepted: seven digits and a two-letter unit (`ms`). */
export declare const LOCAL_EDGE_CORE_NGINX_READ_TIMEOUT_MAX_LENGTH = 9;
/** Splits `host[:port]` (the host may be a bracketed IPv6 literal) and checks both halves. */
declare function LocalEdgeCore_upstreamValueProblem(value: string): string | null;
/**
 * Length limit and shape check of each non-path value written into the router config. A shape
 * check returns what the value must be when it does not fit, or `null`.
 */
declare const LOCAL_EDGE_CORE_NGINX_VALUE_SHAPES: {
    readonly host: {
        readonly maxLength: 253;
        readonly problem: (value: string) => "a lowercase DNS name" | null;
    };
    readonly upstreamHost: {
        readonly maxLength: number;
        readonly problem: typeof LocalEdgeCore_upstreamValueProblem;
    };
    readonly readTimeout: {
        readonly maxLength: 9;
        readonly problem: (value: string) => "an nginx time such as 300s" | null;
    };
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
 * @returns `null` when the value is safe to write unquoted, otherwise the problem.
 * @example
 * ```typescript
 * LocalEdgeCore_nginxValueProblem("play: location / readTimeout", "readTimeout", "3600s"); // null
 * LocalEdgeCore_nginxValueProblem("play: location / upstreamHost", "upstreamHost", "[::1]:5174"); // null
 * LocalEdgeCore_nginxValueProblem("play: location / upstreamHost", "upstreamHost", "a;\nuser root"); // problem text
 * ```
 */
export declare function LocalEdgeCore_nginxValueProblem(field: string, kind: keyof typeof LOCAL_EDGE_CORE_NGINX_VALUE_SHAPES, value: unknown): string | null;
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
export declare function LocalEdgeCore_nginxValueArgument(field: string, kind: keyof typeof LOCAL_EDGE_CORE_NGINX_VALUE_SHAPES, value: string): string;
/** A listener with its defaults filled in. */
type LocalEdgeCore_ResolvedRouterListener = {
    port: number;
    ssl: boolean;
    clientPort: number;
};
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
export declare function LocalEdgeCore_routerListeners(settings: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ResolvedRouterListener[];
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
export declare function LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest: LocalEdgeCore_ExposureManifest): string;
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
export declare function LocalEdgeCore_readTailnetAddresses(runner: LocalEdgeCore_ExposureCommandRunner, tailscaleBin: string): {
    ipv4?: string;
    ipv6?: string;
};
/** Options for the hostname planner and backend. */
export type LocalEdgeCore_HostnamesBackendOptions = {
    runner?: LocalEdgeCore_ExposureCommandRunner | undefined;
    tailscaleBin?: string | undefined;
    nginxBin?: string | undefined;
    legoBin?: string | undefined;
    inspectDir?: LocalEdgeCore_PrivateDirProbe | undefined;
};
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
export declare function LocalEdgeCore_privateDirProblems(dir: string, probe: LocalEdgeCore_PrivateDirProbe): string[];
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
export declare function LocalEdgeCore_planExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, options?: LocalEdgeCore_HostnamesBackendOptions): LocalEdgeCore_ExposureAction[];
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
export declare function LocalEdgeCore_observeHostnamesServeTcp(settings: LocalEdgeCore_ExposureHostnamesConfig, runner: LocalEdgeCore_ExposureCommandRunner, tailscaleBin: string): {
    state: "exposed" | "missing" | "conflict" | "unknown";
    observed: string | null;
    note: string;
};
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
export declare function LocalEdgeCore_createHostnamesBackend(options?: LocalEdgeCore_HostnamesBackendOptions): LocalEdgeCore_ExposureBackend;
export {};
