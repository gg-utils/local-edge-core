/**
 * @fileoverview `tailscale-serve-ports` exposure backend: one tailnet-only HTTPS port per app via
 * `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`.
 *
 * This file owns parsing `tailscale serve status --json`, resolving the host's tailnet DNS name,
 * and the guards: protected ports are refused, Funnel ports are refused, foreign mappings are
 * refused unless the app opts in, and turn-off only runs for a port whose single handler points at
 * the app's own loopback target. `apply()` is a dry run unless `{ apply: true }` is passed.
 * Every issued plan is recorded privately and frozen; `apply()` runs only that recorded copy,
 * refuses a plan object that was edited after it was issued, and re-reads status first so a port
 * that changed since planning is refused instead of overwritten or turned off.
 * Flow: `status --json` -> observed port map -> per-app action -> frozen record -> optional apply
 * (re-read status, compare every affected port, then run).
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
 *
 * @param jsonText - Raw stdout of `tailscale serve status --json`.
 * @returns Map from edge port to its kind (`web-proxy` only for exactly one `/` proxy handler),
 *   proxy target and Funnel flag.
 * @throws When the text is not JSON or not a JSON object.
 *
 * @example
 * ```typescript
 * const observed = LocalEdgeCore_parseTailscaleServeStatus(result.stdout);
 * observed.ports.get(8450)?.proxyTarget; // "http://127.0.0.1:3000" when mapped
 * ```
 */
export declare function LocalEdgeCore_parseTailscaleServeStatus(jsonText: string): LocalEdgeCore_TailscaleServeObserved;
/**
 * Parses `tailscale status --json` and returns `Self.DNSName` without the trailing dot.
 *
 * @param jsonText - Raw stdout of `tailscale status --json`.
 * @returns The node DNS name, or `null` when `Self.DNSName` is missing or empty.
 * @throws When the text is not JSON.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_parseTailnetSelfDnsName('{"Self":{"DNSName":"node-a.tailnet.example."}}'); // "node-a.tailnet.example"
 * ```
 */
export declare function LocalEdgeCore_parseTailnetSelfDnsName(jsonText: string): string | null;
/**
 * Builds the exact serve command that maps `edgePort` to the app's loopback target.
 *
 * @param options - CLI binary, edge HTTPS port and loopback port; not validated here.
 * @returns `[bin, "serve", "--bg", "--https=<edgePort>", "http://127.0.0.1:<localPort>"]`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildTailscaleServeOnArgv({ tailscaleBin: "tailscale", edgePort: 8450, localPort: 3000 });
 * ```
 */
export declare function LocalEdgeCore_buildTailscaleServeOnArgv(options: {
    tailscaleBin: string;
    edgePort: number;
    localPort: number;
}): string[];
/**
 * Builds the exact serve command that turns off `edgePort`.
 *
 * @param options - CLI binary and edge HTTPS port; not validated here.
 * @returns `[bin, "serve", "--https=<edgePort>", "off"]`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildTailscaleServeOffArgv({ tailscaleBin: "tailscale", edgePort: 8450 });
 * ```
 */
export declare function LocalEdgeCore_buildTailscaleServeOffArgv(options: {
    tailscaleBin: string;
    edgePort: number;
}): string[];
/**
 * Checks that an argv is one of the two command shapes this backend emits and that it does not
 * touch a protected port. `apply()` runs it again on its own frozen copy of each step.
 *
 * @param options - Candidate argv, expected CLI binary, and protected ports.
 * @returns `null` when allowed; otherwise a short reason (wrong binary, Funnel/reset/TCP/service
 *   flags, missing or protected `--https` port, or any other shape).
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkTailscaleServeArgv({
 *   argv: ["tailscale", "serve", "--https=443", "off"],
 *   tailscaleBin: "tailscale",
 *   protectedPorts: [443],
 * }); // "port 443 is protected"
 * ```
 */
export declare function LocalEdgeCore_checkTailscaleServeArgv(options: {
    argv: readonly string[];
    tailscaleBin: string;
    protectedPorts: readonly number[];
}): string | null;
/**
 * Plans one app for `plan()`. Pure: all live state comes in through `observed`.
 *
 * @param options - The app, its manifest, observed serve state, edge hostname and CLI binary.
 * @returns `skip` (disabled), `refuse` (no edge port, protected, Funnel, non-proxy config, or a
 *   foreign target without `replaceExistingMapping`), `noop` (already mapped) or `expose` with argv.
 *
 * @example
 * ```typescript
 * const action = LocalEdgeCore_planTailscaleServeApp({ app, manifest, observed, hostname, tailscaleBin: "tailscale" });
 * if (action.kind === "expose") console.log(action.argv);
 * ```
 */
export declare function LocalEdgeCore_planTailscaleServeApp(options: {
    app: LocalEdgeCore_ExposureApp;
    manifest: LocalEdgeCore_ExposureManifest;
    observed: LocalEdgeCore_TailscaleServeObserved;
    hostname: string | null;
    tailscaleBin: string;
}): LocalEdgeCore_ExposureAction;
/**
 * Plans one app for `planRemove()`. Only turns off a port that points at this app's target.
 *
 * @param options - Same inputs as `LocalEdgeCore_planTailscaleServeApp`.
 * @returns `skip`, `noop` (port not mapped), `refuse` (protected, Funnel, or not owned by this
 *   app) or `unexpose` with the turn-off argv.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_planTailscaleServeRemoveApp({ app, manifest, observed, hostname, tailscaleBin: "tailscale" }).kind;
 * ```
 */
export declare function LocalEdgeCore_planTailscaleServeRemoveApp(options: {
    app: LocalEdgeCore_ExposureApp;
    manifest: LocalEdgeCore_ExposureManifest;
    observed: LocalEdgeCore_TailscaleServeObserved;
    hostname: string | null;
    tailscaleBin: string;
}): LocalEdgeCore_ExposureAction;
/**
 * Creates the default `tailscale-serve-ports` backend.
 *
 * @param options - Injectable command runner (default: real spawn) and CLI binary name.
 * @returns A backend whose `plan`/`planRemove` read `serve status` (and `status` when the manifest
 *   has no hostname); whose `apply` refuses foreign, edited or non-applicable plans, is a dry run
 *   without `{ apply: true }`, re-reads status and refuses changed ports before any mutation, and
 *   stops at the first failing command; and whose `remove` plans then applies a removal.
 *
 * @example
 * ```typescript
 * const backend = LocalEdgeCore_createTailscaleServePortsBackend();
 * const plan = backend.plan(manifest);
 * const result = backend.apply(plan, { apply: true });
 * if (!result.ok) console.error(result.message);
 * ```
 */
export declare function LocalEdgeCore_createTailscaleServePortsBackend(options?: LocalEdgeCore_TailscaleServePortsOptions): LocalEdgeCore_ExposureBackend & {
    readObserved(): LocalEdgeCore_TailscaleServeReadResult;
    resolveHostname(manifest: LocalEdgeCore_ExposureManifest): string | null;
};
