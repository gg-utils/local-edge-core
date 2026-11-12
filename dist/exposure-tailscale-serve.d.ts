/**
 * @fileoverview `tailscale-serve-ports` exposure backend: one tailnet-only HTTPS port per app via
 * `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`.
 *
 * This file owns parsing `tailscale serve status --json`, resolving the host's tailnet DNS name,
 * and the guards: protected ports are refused, Funnel ports are refused, foreign mappings are
 * refused unless the app opts in, and turn-off only runs for a port whose single handler points at
 * the app's own loopback target. `apply()` is a dry run unless `{ apply: true }` is passed.
 * Flow: `status --json` -> observed port map -> per-app action -> optional apply -> re-read status.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-tailscale-serve.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract, manifest validation and plan rendering.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { type LocalEdgeCore_ExposureAction, type LocalEdgeCore_ExposureApp, type LocalEdgeCore_ExposureBackend, type LocalEdgeCore_ExposureCommandRunner, type LocalEdgeCore_ExposureManifest } from "./exposure.js";
/** Backend name used in config and on the command line. */
export declare const LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND = "tailscale-serve-ports";
/** How one edge port is currently configured on this node. */
export type LocalEdgeCore_TailscaleServePortState = {
    port: number;
    /** `web-proxy`: HTTPS with exactly one `/` proxy handler. Anything else is never replaced. */
    kind: "web-proxy" | "web-other" | "tcp" | "unknown";
    proxyTarget: string | null;
    funnel: boolean;
};
/** Parsed serve configuration for the node itself (service hosts are ignored). */
export type LocalEdgeCore_TailscaleServeObserved = {
    ports: ReadonlyMap<number, LocalEdgeCore_TailscaleServePortState>;
};
/** Result of reading live serve status. */
export type LocalEdgeCore_TailscaleServeReadResult = {
    ok: true;
    observed: LocalEdgeCore_TailscaleServeObserved;
} | {
    ok: false;
    message: string;
};
/** Options for the backend factory. */
export type LocalEdgeCore_TailscaleServePortsOptions = {
    runner?: LocalEdgeCore_ExposureCommandRunner | undefined;
    /** Tailscale CLI binary. Defaults to `tailscale` on PATH. */
    tailscaleBin?: string | undefined;
};
/**
 * Parses `tailscale serve status --json` output into a per-port map for the node itself.
 *
 * @remarks
 * Only top-level `TCP`, `Web` and `AllowFunnel` are read. `Services` belong to other hostnames and
 * are not port mappings of this node. Empty output means nothing is configured.
 */
export declare function LocalEdgeCore_parseTailscaleServeStatus(jsonText: string): LocalEdgeCore_TailscaleServeObserved;
/** Parses `tailscale status --json` and returns `Self.DNSName` without the trailing dot. */
export declare function LocalEdgeCore_parseTailnetSelfDnsName(jsonText: string): string | null;
/** Builds the exact serve command that maps `edgePort` to the app's loopback target. */
export declare function LocalEdgeCore_buildTailscaleServeOnArgv(options: {
    tailscaleBin: string;
    edgePort: number;
    localPort: number;
}): string[];
/** Builds the exact serve command that turns off `edgePort`. */
export declare function LocalEdgeCore_buildTailscaleServeOffArgv(options: {
    tailscaleBin: string;
    edgePort: number;
}): string[];
/**
 * Checks that an argv is one of the two command shapes this backend emits and that it does not
 * touch a protected port. Used by `apply()` so a hand-edited plan cannot widen what runs.
 */
export declare function LocalEdgeCore_checkTailscaleServeArgv(options: {
    argv: readonly string[];
    tailscaleBin: string;
    protectedPorts: readonly number[];
}): string | null;
/** Plans one app for `plan()`. Pure: all live state comes in through `observed`. */
export declare function LocalEdgeCore_planTailscaleServeApp(options: {
    app: LocalEdgeCore_ExposureApp;
    manifest: LocalEdgeCore_ExposureManifest;
    observed: LocalEdgeCore_TailscaleServeObserved;
    hostname: string | null;
    tailscaleBin: string;
}): LocalEdgeCore_ExposureAction;
/** Plans one app for `planRemove()`. Only turns off a port that points at this app's target. */
export declare function LocalEdgeCore_planTailscaleServeRemoveApp(options: {
    app: LocalEdgeCore_ExposureApp;
    manifest: LocalEdgeCore_ExposureManifest;
    observed: LocalEdgeCore_TailscaleServeObserved;
    hostname: string | null;
    tailscaleBin: string;
}): LocalEdgeCore_ExposureAction;
/** Creates the default `tailscale-serve-ports` backend. */
export declare function LocalEdgeCore_createTailscaleServePortsBackend(options?: LocalEdgeCore_TailscaleServePortsOptions): LocalEdgeCore_ExposureBackend & {
    readObserved(): LocalEdgeCore_TailscaleServeReadResult;
    resolveHostname(manifest: LocalEdgeCore_ExposureManifest): string | null;
};
