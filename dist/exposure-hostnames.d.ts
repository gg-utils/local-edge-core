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
import { type LocalEdgeCore_ExposureAction, type LocalEdgeCore_ExposureAppLocation, type LocalEdgeCore_ExposureBackend, type LocalEdgeCore_ExposureCommandRunner, type LocalEdgeCore_ExposureHostnamesConfig, type LocalEdgeCore_ExposureManifest } from "./exposure.js";
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
/** Default probe: `stat` the folder and walk up looking for a `.git` entry. Reads only. */
export declare const LocalEdgeCore_inspectPrivateDir: LocalEdgeCore_PrivateDirProbe;
/** Builds the host for one app: config function, then template, then the compact default. */
export declare function LocalEdgeCore_buildExposureHostname(settings: LocalEdgeCore_ExposureHostnamesConfig, app: string, appTemplate?: string): string;
/** Builds the wildcard every host must sit directly under, for example `*.proj-m1.example.test`. */
export declare function LocalEdgeCore_buildExposureHostnamesWildcard(settings: LocalEdgeCore_ExposureHostnamesConfig): string;
/** Every wildcard hosts may sit under: the main one first, then `extraWildcardTemplates`. */
export declare function LocalEdgeCore_buildExposureHostnamesWildcards(settings: LocalEdgeCore_ExposureHostnamesConfig): string[];
/** nginx regex `map` key matching every SNI name under a zone, for example `~\.example\.test$`. */
export declare function LocalEdgeCore_sniZoneSuffixPattern(rootZone: string): string;
/** Edge URL for a host behind the router port. */
export declare function LocalEdgeCore_hostnamesEdgeUrl(host: string, port: number): string;
/** One enabled app with its host. */
export type LocalEdgeCore_ExposureHostnameEntry = {
    appId: string;
    name: string;
    host: string;
    localPort: number;
    locations: readonly LocalEdgeCore_ExposureAppLocation[];
};
/** Lists the enabled apps with their hosts. Throws when a name cannot be built. */
export declare function LocalEdgeCore_listExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, settings: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ExposureHostnameEntry[];
/**
 * Validates the hostname settings and every app name: DNS labels, one host per app, each host
 * directly under the wildcard, loopback router on a valid unprotected port, absolute paths.
 * Returns problems; empty means valid.
 */
export declare function LocalEdgeCore_validateExposureHostnames(manifest: LocalEdgeCore_ExposureManifest): string[];
/** A listener with its defaults filled in. */
type LocalEdgeCore_ResolvedRouterListener = {
    port: number;
    ssl: boolean;
    clientPort: number;
};
/** The router's HTTP listeners. Omitted in config: one TLS listener on `routerPort`. */
export declare function LocalEdgeCore_routerListeners(settings: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ResolvedRouterListener[];
/**
 * Renders the whole router `nginx.conf`: pid, logs and temp paths from config, an optional SNI
 * stream router, the certificate at http level, a default server on every listener that answers
 * 421 for unknown names, and one SNI server block per enabled app. Pure and deterministic, so a supervisor can compare it with the file on disk.
 * Throws when the settings or names are invalid.
 */
export declare function LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest: LocalEdgeCore_ExposureManifest): string;
/** Reads the node's tailnet addresses from `tailscale status --json`. Read-only. */
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
/** Lists why a folder is not private (0700) and outside any git checkout. Empty means fine. */
export declare function LocalEdgeCore_privateDirProblems(dir: string, probe: LocalEdgeCore_PrivateDirProbe): string[];
/** Builds every planned action for the hostname backend. Reads only (status JSON, folder modes). */
export declare function LocalEdgeCore_planExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, options?: LocalEdgeCore_HostnamesBackendOptions): LocalEdgeCore_ExposureAction[];
/**
 * Observes the Serve TCP mapping in front of the router, read-only, from `serve status --json`:
 * `exposed` when the edge port forwards to the router, `missing` when the port is unmapped, and
 * `conflict` when it is mapped to anything else.
 */
export declare function LocalEdgeCore_observeHostnamesServeTcp(settings: LocalEdgeCore_ExposureHostnamesConfig, runner: LocalEdgeCore_ExposureCommandRunner, tailscaleBin: string): {
    state: "exposed" | "missing" | "conflict" | "unknown";
    observed: string | null;
    note: string;
};
/** Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse. */
export declare function LocalEdgeCore_createHostnamesBackend(options?: LocalEdgeCore_HostnamesBackendOptions): LocalEdgeCore_ExposureBackend;
export {};
