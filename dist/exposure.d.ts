/**
 * @fileoverview Product-neutral exposure-backend contract: how a set of loopback apps becomes
 * reachable at an edge URL, as a switchable backend with plan, apply, remove and status.
 *
 * This file owns the shared types, the injectable host command runner, and the manifest checks
 * every backend runs first (duplicate ports, protected ports, loopback-only targets). Concrete
 * backends live in `exposure-tailscale-serve.ts` and `exposure-plan-only.ts`.
 * Flow: adapter builds `LocalEdgeCore_ExposureManifest` -> backend `plan()` -> operator reviews the
 * dry-run actions -> backend `apply()` with `{ apply: true }` runs only the planned host commands.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure.unit.test.ts
 *
 * @see src/exposure-tailscale-serve.ts - Default backend that maps one tailnet-only HTTPS port per app.
 * @see src/exposure-plan-only.ts - Backends that need an owner or admin and only print a plan.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Loopback host every exposure target must use. Apps never bind to a public or tailnet address. */
export declare const LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST = "127.0.0.1";
/** One app the manifest wants reachable at an edge URL. */
export type LocalEdgeCore_ExposureApp = {
    /** Stable app id, also used as the service label by name-based backends. */
    id: string;
    /** Disabled apps are listed in plans as skipped and never touched. */
    enabled: boolean;
    /** Loopback port the app listens on. */
    localPort: number;
    /** Edge HTTPS port for port-based backends. */
    edgePort?: number | undefined;
    /** Name for name-based backends (service or DNS label). Defaults to `id`. */
    edgeName?: string | undefined;
    /**
     * Allow the port backend to replace an existing mapping that points at a different target.
     * Off by default: an existing foreign mapping is refused.
     */
    replaceExistingMapping?: boolean | undefined;
};
/** TLS source for the hostname backend: an mkcert wildcard per realm, or a provided pair. */
export type LocalEdgeCore_ExposureHostnamesTls = {
    mode: "mkcert";
    certDir: string;
} | {
    mode: "provided";
    certPath: string;
    keyPath: string;
};
/**
 * Settings for the hostname backend. Hosts are `<app>.<realm>.<method>.<machine>.<rootZone>`,
 * routed by SNI on one loopback router port.
 */
export type LocalEdgeCore_ExposureHostnamesConfig = {
    realm: string;
    method: string;
    machine: string;
    rootZone: string;
    /** Loopback router listen host. Must be 127.0.0.1. */
    routerHost: string;
    routerPort: number;
    tls: LocalEdgeCore_ExposureHostnamesTls;
    /** Local dnsmasq listener used by the planned resolver file. */
    dns: {
        listenAddress: string;
        port: number;
        resolverDir: string;
        logPath: string;
    };
    /** Plan a tailnet raw-TCP Serve mapping of the router port. Defaults to true. */
    tailnetTcp?: boolean | undefined;
};
/** Backend-neutral manifest consumed by every exposure backend. */
export type LocalEdgeCore_ExposureManifest = {
    apps: readonly LocalEdgeCore_ExposureApp[];
    /** Edge ports the backend must never map, change or turn off. */
    protectedPorts: readonly number[];
    /** Edge hostname. Port backends fall back to the host's own tailnet DNS name. */
    hostname?: string | undefined;
    /** Root DNS zone for name-based backends that build `<name>.<zone>` hosts. */
    rootZone?: string | undefined;
    /** Settings for the hostname backend; required only when that backend is selected. */
    hostnames?: LocalEdgeCore_ExposureHostnamesConfig | undefined;
};
/** What the backend would do (or refuses to do) for one app. */
export type LocalEdgeCore_ExposureActionKind = "expose" | "unexpose" | "noop" | "skip" | "refuse" | "manual";
/** Who must act before a planned action can run. */
export type LocalEdgeCore_ExposureRequirement = "none" | "tailnet-admin" | "dns-tls-owner";
/** One planned action. `argv` is the exact host command, when there is one. */
export type LocalEdgeCore_ExposureAction = {
    kind: LocalEdgeCore_ExposureActionKind;
    appId: string;
    reason: string;
    requires: LocalEdgeCore_ExposureRequirement;
    edgeUrl?: string | undefined;
    target?: string | undefined;
    argv?: readonly string[] | undefined;
    /** Extra plan text for manual actions (for example a rendered config block). */
    detail?: string | undefined;
};
/** Plan produced by `plan()` or `planRemove()`. */
export type LocalEdgeCore_ExposurePlan = {
    backend: string;
    hostname: string | null;
    actions: readonly LocalEdgeCore_ExposureAction[];
    /** True when the backend can run this plan itself (no refusals, no manual steps). */
    applicable: boolean;
};
/** Observed state of one app at the edge. */
export type LocalEdgeCore_ExposureAppState = "exposed" | "missing" | "conflict" | "protected" | "disabled" | "unknown";
/** Status row for one app. */
export type LocalEdgeCore_ExposureStatusEntry = {
    appId: string;
    state: LocalEdgeCore_ExposureAppState;
    edgeUrl: string | null;
    target: string;
    observedTarget: string | null;
    note: string;
};
/** Result of `apply()`: what ran, and whether every step succeeded. */
export type LocalEdgeCore_ExposureApplyResult = {
    backend: string;
    dryRun: boolean;
    ok: boolean;
    ran: readonly {
        argv: readonly string[];
        status: number | null;
        stderr: string;
    }[];
    message: string;
};
/** Options for `apply()`. Without `apply: true` the call is a dry run that runs nothing. */
export type LocalEdgeCore_ExposureApplyOptions = {
    apply?: boolean | undefined;
};
/** Switchable exposure backend. */
export type LocalEdgeCore_ExposureBackend = {
    readonly name: string;
    /** `none` when the backend can run without an admin or owner step. */
    readonly requires: LocalEdgeCore_ExposureRequirement;
    plan(manifest: LocalEdgeCore_ExposureManifest): LocalEdgeCore_ExposurePlan;
    planRemove(manifest: LocalEdgeCore_ExposureManifest): LocalEdgeCore_ExposurePlan;
    apply(plan: LocalEdgeCore_ExposurePlan, options?: LocalEdgeCore_ExposureApplyOptions): LocalEdgeCore_ExposureApplyResult;
    remove(manifest: LocalEdgeCore_ExposureManifest, options?: LocalEdgeCore_ExposureApplyOptions): LocalEdgeCore_ExposureApplyResult;
    status(manifest: LocalEdgeCore_ExposureManifest): readonly LocalEdgeCore_ExposureStatusEntry[];
};
/** Result of one host command. */
export type LocalEdgeCore_ExposureCommandResult = {
    status: number | null;
    stdout: string;
    stderr: string;
};
/** Injectable host command runner. Tests pass a fake; nothing here shells out implicitly. */
export type LocalEdgeCore_ExposureCommandRunner = (command: string, args: readonly string[]) => LocalEdgeCore_ExposureCommandResult;
/** Default runner: synchronous spawn, no shell, captured output, 15 s timeout. */
export declare const LocalEdgeCore_exposureDefaultCommandRunner: LocalEdgeCore_ExposureCommandRunner;
/** Loopback HTTP target for an app. */
export declare function LocalEdgeCore_exposureTargetUrl(localPort: number): string;
/** True for an integer TCP port in 1..65535. */
export declare function LocalEdgeCore_exposureIsPort(value: unknown): value is number;
/**
 * Checks the manifest shape every backend relies on. Returns a list of problems; empty means valid.
 *
 * @remarks
 * Duplicate edge ports, duplicate ids, invalid ports and enabled apps on protected ports are all
 * problems. Backends turn each problem into a `refuse` action instead of throwing, so the operator
 * sees the full plan.
 */
export declare function LocalEdgeCore_validateExposureManifest(manifest: LocalEdgeCore_ExposureManifest): string[];
/** Builds a plan object and computes `applicable` from its actions. */
export declare function LocalEdgeCore_buildExposurePlan(options: {
    backend: string;
    hostname: string | null;
    actions: readonly LocalEdgeCore_ExposureAction[];
}): LocalEdgeCore_ExposurePlan;
/** Renders a plan as plain text lines for terminals. */
export declare function LocalEdgeCore_renderExposurePlanText(plan: LocalEdgeCore_ExposurePlan): string;
/** Refusing `apply()` result shared by backends that cannot run the given plan. */
export declare function LocalEdgeCore_refusedExposureApply(options: {
    backend: string;
    dryRun: boolean;
    message: string;
}): LocalEdgeCore_ExposureApplyResult;
