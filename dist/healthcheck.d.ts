/**
 * @fileoverview Owns product-neutral local-edge healthcheck argv/env parsing, probe-path
 * construction, HTTP health classification, per-cycle rollups, fingerprinting, and watch-mode
 * summary or strict-exit decisions without performing I/O.
 *
 * Adapters own registry lookup, HTTPS probing, artifact writes, and product surface semantics; this
 * module receives explicit argv/env/probe facts and returns deterministic options, rollups,
 * fingerprints, and cadence helpers reusable by any local-edge consumer.
 *
 * @example
 * ```typescript
 * import {
 *   LocalEdgeCore_parseHealthcheckRuntimeOptions,
 *   LocalEdgeCore_computeHealthProbeRollups,
 * } from "@gg-utils/local-edge-core/healthcheck";
 *
 * const { options, warnings } = LocalEdgeCore_parseHealthcheckRuntimeOptions({
 *   args: ["--watch", "--strict", "--method", "nginx-docker"],
 *   defaultMethod: "nginx-docker",
 *   supportedMethods: ["nginx-docker"],
 *   strictStartValue: undefined,
 *   healthcheckLogVerbosityValue: undefined,
 *   commandLabel: "local-edge:healthcheck",
 *   defaultIntervalMs: 5000,
 *   defaultSteadyIntervalMs: 10000,
 *   defaultTimeoutMs: 3000,
 * });
 *
 * const rollups = LocalEdgeCore_computeHealthProbeRollups([
 *   { healthy: true, failureDomain: "none" },
 *   { healthy: false, failureDomain: "router" },
 * ]);
 * ```
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/healthcheck.unit.test.ts
 * @testing CLI: npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/healthcheck.unit.test.ts - Node test module that locks parse rules, rollup math, fingerprint stability, and watch-summary or strict-failure decisions for this surface.
 * @see packages/local-edge-core/src/method-config.ts - Shared `--method` validation imported while resolving supported healthcheck method selectors from argv.
 * @see packages/local-edge-kit/src/healthcheck-cli.ts - Kit runner that composes these pure helpers with HTTPS probes, registry reads, and artifact writes for end-to-end healthchecks.
 * @see packages/local-edge-core/README.md - Package README summarizing how healthcheck helpers fit alongside other local-edge-core primitives.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Domain assigned to a health probe failure after transport/application classification. */
export type LocalEdgeCore_HealthFailureDomain = "none" | "application" | "router";
/** Console logging density for repetitive watch cycles versus full probe traces. */
export type LocalEdgeCore_HealthcheckLogVerbosity = "changes-and-warnings-only" | "all";
/** Pure runtime options parsed from local-edge healthcheck argv/env inputs. */
export type LocalEdgeCore_HealthcheckRuntimeOptions = {
    readonly requestedMethod: string;
    readonly requestedRealmSlug: string | null;
    readonly includeInactive: boolean;
    readonly strict: boolean;
    readonly watch: boolean;
    readonly intervalMs: number;
    readonly steadyIntervalMs: number;
    readonly timeoutMs: number;
    readonly untilHealthy: boolean;
    readonly maxWaitMs: number | null;
    readonly logVerbosity: LocalEdgeCore_HealthcheckLogVerbosity;
    readonly logVerbositySource: "cli" | "env" | "default";
};
/** Result of parsing healthcheck argv/env, including warnings adapters should print. */
export type LocalEdgeCore_HealthcheckRuntimeParseResult = {
    readonly options: LocalEdgeCore_HealthcheckRuntimeOptions;
    readonly warnings: readonly string[];
};
/** Inputs for pure healthcheck runtime-option parsing. */
export type LocalEdgeCore_ParseHealthcheckRuntimeOptionsInput = {
    readonly args: readonly string[];
    readonly defaultMethod: string;
    readonly supportedMethods: readonly string[];
    readonly strictStartValue: string | undefined;
    readonly healthcheckLogVerbosityValue: string | undefined;
    readonly commandLabel: string;
    readonly defaultIntervalMs: number;
    readonly defaultSteadyIntervalMs: number;
    readonly defaultTimeoutMs: number;
};
/** Minimal probe identity used for stable watch-mode deduplication keys. */
export type LocalEdgeCore_HealthProbeIdentity = {
    readonly realmSlug: string;
    readonly method: string;
    readonly surface: string;
};
/** Minimal probe state needed to compute health fingerprints. */
export type LocalEdgeCore_HealthProbeFingerprintInput = LocalEdgeCore_HealthProbeIdentity & {
    readonly healthy: boolean;
};
/** Minimal probe state needed for per-cycle health rollups. */
export type LocalEdgeCore_HealthProbeRollupInput = {
    readonly healthy: boolean;
    readonly failureDomain: LocalEdgeCore_HealthFailureDomain;
};
/** Aggregated health counts for one probe cycle. */
export type LocalEdgeCore_HealthProbeRollups = {
    readonly failedProbeCount: number;
    readonly applicationFailedProbeCount: number;
    readonly routerFailedProbeCount: number;
    readonly healthyProbeCount: number;
};
/** Inputs that control healthcheck summary cadence without touching probe state. */
export type LocalEdgeCore_ShouldLogHealthSummaryOptions = {
    readonly hasAnyUnhealthy: boolean;
    readonly isFirstCycle: boolean;
    readonly isHeartbeat: boolean;
    readonly isVerbose: boolean;
    readonly summaryChanged: boolean;
    readonly watch: boolean;
};
/** Inputs that determine whether strict watch mode should exit with failure. */
export type LocalEdgeCore_ShouldFailStrictHealthWatchOptions = {
    readonly failedProbeCount: number;
    readonly maxWaitMs: number | null;
    readonly strict: boolean;
    readonly untilHealthy: boolean;
    readonly watch: boolean;
};
/** Inputs for building the cheap HTTP status request path used by health probes. */
export type LocalEdgeCore_BuildHealthcheckRequestPathOptions = {
    readonly statusPath: string;
    readonly surface: string;
    readonly method: string;
    readonly commandLabel: string;
};
/** Parses healthcheck runtime options without probing network or touching the filesystem. */
export declare function LocalEdgeCore_parseHealthcheckRuntimeOptions(input: LocalEdgeCore_ParseHealthcheckRuntimeOptionsInput): LocalEdgeCore_HealthcheckRuntimeParseResult;
/** Returns true when an HTTP status code should count as a healthy probe response. */
export declare function LocalEdgeCore_isHealthyHttpStatusCode(statusCode: number | null): boolean;
/** Classifies transport-layer probe errors separately from upstream HTTP responses. */
export declare function LocalEdgeCore_classifyHealthcheckErrorDomain(message: string): Exclude<LocalEdgeCore_HealthFailureDomain, "none">;
/** Builds a non-root status path with local-edge probe query parameters. */
export declare function LocalEdgeCore_buildHealthcheckRequestPath(options: LocalEdgeCore_BuildHealthcheckRequestPathOptions): string;
/** Builds a stable string key for deduplicating one probe across watch iterations. */
export declare function LocalEdgeCore_healthProbeKey(probe: LocalEdgeCore_HealthProbeIdentity): string;
/** Single-pass rollup of per-probe failure domains for one watch iteration. */
export declare function LocalEdgeCore_computeHealthProbeRollups(probes: readonly LocalEdgeCore_HealthProbeRollupInput[]): LocalEdgeCore_HealthProbeRollups;
/** Deterministic fingerprint of which probes are healthy for stabilization tracking. */
export declare function LocalEdgeCore_computeHealthFingerprint(probes: readonly LocalEdgeCore_HealthProbeFingerprintInput[]): string;
/** Advances consecutive-stable-cycle counters when the fingerprint matches the prior cycle. */
export declare function LocalEdgeCore_tickHealthFingerprintStability(options: {
    readonly currentHealthFingerprint: string;
    readonly previousHealthFingerprint: string | null;
    readonly consecutiveStableCycles: number;
}): {
    readonly consecutiveStableCycles: number;
    readonly previousHealthFingerprint: string | null;
};
/** Decides whether the current healthcheck cycle should emit the full summary and artifact path. */
export declare function LocalEdgeCore_shouldLogHealthSummary(options: LocalEdgeCore_ShouldLogHealthSummaryOptions): boolean;
/** Checks whether strict watch mode exhausted its wait budget with remaining failures. */
export declare function LocalEdgeCore_shouldFailStrictHealthWatch(options: LocalEdgeCore_ShouldFailStrictHealthWatchOptions): boolean;
//# sourceMappingURL=healthcheck.d.ts.map