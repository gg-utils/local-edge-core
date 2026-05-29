/**
 * @fileoverview Product-neutral network probe helpers for local-edge routers and diagnostics.
 *
 * This file owns best-effort TCP client probes, `lsof`-based listener checks, macOS `lo0` loopback
 * alias detection, SIGTERM cleanup for processes listening on a port, and curl-backed HTTP health
 * probes; callers decide which host/port pairs matter, how failures surface to operators, and
 * whether a failed probe should influence process exit behavior.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/network.unit.test.ts
 *
 * @see packages/local-edge-core/src/index.ts - Root `@gg-utils/local-edge-core` barrel that re-exports these network helpers alongside other local-edge primitives wired into kit CLIs and shared workflows.
 * @see packages/local-edge-core/src/host-mutations.ts - Host-mutation subpath barrel that re-exports these helpers when operators coordinate DNS, TLS, Docker, and listener-side host changes together.
 * @see packages/local-edge-core/src/network.unit.test.ts - Jest regression module that exercises TCP probes, listener polling, loopback alias parsing, and router curl probes for this module's exports.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Options for a best-effort TCP listener probe. */
export type LocalEdgeCore_TcpPortProbeOptions = {
    readonly host: string;
    readonly port: number;
    readonly timeoutMs: number;
};
/**
 * Returns whether a TCP connection can be established before timeout/error.
 *
 * @remarks
 * This is intentionally best-effort and side-effect-light: it opens and immediately destroys one
 * client socket, returning `false` for timeout, refusal, DNS, and other connection errors.
 */
export declare function LocalEdgeCore_isTcpPortListening(options: LocalEdgeCore_TcpPortProbeOptions): Promise<boolean>;
/** Returns true when a TCP listener is active on `port`, optionally scoped to `host`. */
export declare function LocalEdgeCore_isPortListening(options: {
    port: number;
    host?: string;
}): boolean;
/** Polls until `port` has an active listener or `timeoutSeconds` elapses. */
export declare function LocalEdgeCore_waitForPort(options: {
    port: number;
    timeoutSeconds: number;
    host?: string;
}): boolean;
/** Polls until `port` has no active listener or `timeoutSeconds` elapses. */
export declare function LocalEdgeCore_waitForPortClosed(options: {
    port: number;
    timeoutSeconds: number;
    host?: string;
}): boolean;
/** Returns true when a loopback alias for `ip` exists on `lo0`; `127.0.0.1` is always present. */
export declare function LocalEdgeCore_loopbackAliasExists(ip: string): boolean;
/** Finds and terminates processes listening on `port` via SIGTERM. */
export declare function LocalEdgeCore_terminateListenersOnPort(port: number): void;
/** Issues a curl health probe and accepts any real 3-digit HTTP status except `000`. */
export declare function LocalEdgeCore_routerHostProbe(options: {
    url: string;
    connectTimeout: number;
    maxTime: number;
}): boolean;
/** Returns true when a legacy host-managed proxy plist exists and the target host/port listens. */
export declare function LocalEdgeCore_legacyProxyConflictPresent(options: {
    plistPath: string;
    port: number;
    host: string;
}): boolean;
//# sourceMappingURL=network.d.ts.map