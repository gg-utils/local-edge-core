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
import { type LocalEdgeCore_ExposureAction, type LocalEdgeCore_ExposureBackend, type LocalEdgeCore_ExposureCommandRunner, type LocalEdgeCore_ExposureHostnamesConfig, type LocalEdgeCore_ExposureManifest } from "./exposure.js";
/** Backend name for SNI-routed hostnames. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Default hostname template. `{label}` is `<app>` or `<app>--<realm>`. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_TEMPLATE = "{label}.{projectMachine}.{rootZone}";
/** Default wildcard template. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_DEFAULT_WILDCARD = "*.{projectMachine}.{rootZone}";
/** Router health path answered by nginx itself on every host. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_ROUTER_HEALTH_PATH = "/__local-edge/router-health";
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
export declare function LocalEdgeCore_buildExposureHostname(settings: LocalEdgeCore_ExposureHostnamesConfig, app: string): string;
/** Builds the wildcard every host must sit directly under, for example `*.proj-m1.example.test`. */
export declare function LocalEdgeCore_buildExposureHostnamesWildcard(settings: LocalEdgeCore_ExposureHostnamesConfig): string;
/** Edge URL for a host behind the router port. */
export declare function LocalEdgeCore_hostnamesEdgeUrl(host: string, port: number): string;
/** One enabled app with its host. */
export type LocalEdgeCore_ExposureHostnameEntry = {
    appId: string;
    name: string;
    host: string;
    localPort: number;
};
/** Lists the enabled apps with their hosts. Throws when a name cannot be built. */
export declare function LocalEdgeCore_listExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, settings: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ExposureHostnameEntry[];
/**
 * Validates the hostname settings and every app name: DNS labels, one host per app, each host
 * directly under the wildcard, loopback router on a valid unprotected port, absolute paths.
 * Returns problems; empty means valid.
 */
export declare function LocalEdgeCore_validateExposureHostnames(manifest: LocalEdgeCore_ExposureManifest): string[];
/**
 * Renders the whole router `nginx.conf`: pid, logs and temp paths from config, a default server
 * that rejects the TLS handshake for unknown names, and one SNI server block per enabled app.
 * Pure. Throws when the settings or names are invalid.
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
/** Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse. */
export declare function LocalEdgeCore_createHostnamesBackend(options?: LocalEdgeCore_HostnamesBackendOptions): LocalEdgeCore_ExposureBackend;
