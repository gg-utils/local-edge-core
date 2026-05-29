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
import { LocalEdgeCore_validateRequestedMethod } from "./method-config.js";
/** Returns whether a valueless CLI flag is present in argv. */
function LocalEdgeCore_hasBooleanArg(args, flag) {
    return args.includes(flag);
}
/** Parses a positive integer CLI flag value or returns null when absent. */
function LocalEdgeCore_parsePositiveIntArg(options) {
    const argIndex = options.args.findIndex((arg) => arg === options.flag);
    if (argIndex === -1 || !options.args[argIndex + 1]) {
        return null;
    }
    const rawValue = options.args[argIndex + 1];
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
        throw new Error(`[${options.commandLabel}] ${options.flag} must be a positive integer. Received '${rawValue}'.`);
    }
    return parsedValue;
}
/** Ensures argv only contains known healthcheck flags and valid value pairs. */
function LocalEdgeCore_validateHealthcheckArgs(options) {
    const flagsWithValues = new Set([
        "--method",
        "--realm",
        "--interval-ms",
        "--steady-interval-ms",
        "--timeout-ms",
        "--max-wait-ms",
        "--healthcheck-log-verbosity",
    ]);
    const valuelessFlags = new Set([
        "--strict",
        "--include-inactive",
        "--no-strict",
        "--watch",
        "--until-healthy",
    ]);
    for (let index = 0; index < options.args.length; index += 1) {
        const argument = options.args[index];
        if (flagsWithValues.has(argument)) {
            const value = options.args[index + 1];
            if (!value || value.startsWith("--")) {
                throw new Error(`[${options.commandLabel}] ${argument} requires a value.`);
            }
            index += 1;
            continue;
        }
        if (valuelessFlags.has(argument)) {
            continue;
        }
        throw new Error(`[${options.commandLabel}] Unknown option: ${argument}`);
    }
}
/** Returns the value paired with a CLI flag, or null when the flag is absent. */
function LocalEdgeCore_getFlagValue(options) {
    const argIndex = options.args.findIndex((arg) => arg === options.flag);
    if (argIndex === -1 || !options.args[argIndex + 1]) {
        return null;
    }
    return options.args[argIndex + 1];
}
/** Parses the healthcheck method selector and returns any compatibility warnings. */
function LocalEdgeCore_parseHealthcheckMethod(options) {
    const methodValue = LocalEdgeCore_getFlagValue({
        args: options.args,
        flag: "--method",
    });
    if (methodValue === null) {
        return { method: options.defaultMethod, warnings: [] };
    }
    if (methodValue === "all") {
        return {
            method: options.defaultMethod,
            warnings: [
                `[${options.commandLabel}] WARNING: --method all is deprecated in single-method mode. Using '${options.defaultMethod}'.`,
            ],
        };
    }
    return {
        method: LocalEdgeCore_validateRequestedMethod({
            allowAll: false,
            commandLabel: options.commandLabel,
            method: methodValue,
            supportedMethods: options.supportedMethods,
        }),
        warnings: [],
    };
}
/** Parses healthcheck log verbosity from CLI first, env second, then default. */
function LocalEdgeCore_parseHealthcheckLogVerbosity(options) {
    const cliValue = LocalEdgeCore_getFlagValue({
        args: options.args,
        flag: "--healthcheck-log-verbosity",
    });
    if (cliValue !== null) {
        if (cliValue === "changes-and-warnings-only" || cliValue === "all") {
            return { value: cliValue, source: "cli" };
        }
        throw new Error(`[${options.commandLabel}] --healthcheck-log-verbosity must be 'changes-and-warnings-only' or 'all'. Received '${cliValue}'.`);
    }
    if (options.rawEnvValue) {
        const normalized = options.rawEnvValue.trim();
        if (normalized === "changes-and-warnings-only" || normalized === "all") {
            return { value: normalized, source: "env" };
        }
        throw new Error(`[${options.commandLabel}] LOCAL_EDGE_HEALTHCHECK_LOG_VERBOSITY must be 'changes-and-warnings-only' or 'all'. Received '${normalized}'.`);
    }
    return { value: "changes-and-warnings-only", source: "default" };
}
/** Parses healthcheck runtime options without probing network or touching the filesystem. */
export function LocalEdgeCore_parseHealthcheckRuntimeOptions(input) {
    LocalEdgeCore_validateHealthcheckArgs({
        args: input.args,
        commandLabel: input.commandLabel,
    });
    const methodResult = LocalEdgeCore_parseHealthcheckMethod({
        args: input.args,
        defaultMethod: input.defaultMethod,
        supportedMethods: input.supportedMethods,
        commandLabel: input.commandLabel,
    });
    const requestedRealmSlug = LocalEdgeCore_getFlagValue({
        args: input.args,
        flag: "--realm",
    });
    const includeInactive = LocalEdgeCore_hasBooleanArg(input.args, "--include-inactive");
    const strict = LocalEdgeCore_hasBooleanArg(input.args, "--strict") ||
        input.strictStartValue === "true" ||
        input.strictStartValue === "1";
    const watch = LocalEdgeCore_hasBooleanArg(input.args, "--watch");
    const intervalMs = LocalEdgeCore_parsePositiveIntArg({
        args: input.args,
        flag: "--interval-ms",
        commandLabel: input.commandLabel,
    }) ?? input.defaultIntervalMs;
    const steadyIntervalMs = LocalEdgeCore_parsePositiveIntArg({
        args: input.args,
        flag: "--steady-interval-ms",
        commandLabel: input.commandLabel,
    }) ?? input.defaultSteadyIntervalMs;
    const timeoutMs = LocalEdgeCore_parsePositiveIntArg({
        args: input.args,
        flag: "--timeout-ms",
        commandLabel: input.commandLabel,
    }) ?? input.defaultTimeoutMs;
    const untilHealthy = LocalEdgeCore_hasBooleanArg(input.args, "--until-healthy");
    const maxWaitMs = LocalEdgeCore_parsePositiveIntArg({
        args: input.args,
        flag: "--max-wait-ms",
        commandLabel: input.commandLabel,
    });
    const logVerbosity = LocalEdgeCore_parseHealthcheckLogVerbosity({
        args: input.args,
        rawEnvValue: input.healthcheckLogVerbosityValue,
        commandLabel: input.commandLabel,
    });
    if (maxWaitMs !== null && !watch) {
        throw new Error(`[${input.commandLabel}] --max-wait-ms requires --watch.`);
    }
    if (untilHealthy && !watch) {
        throw new Error(`[${input.commandLabel}] --until-healthy requires --watch.`);
    }
    return {
        options: {
            requestedMethod: methodResult.method,
            requestedRealmSlug,
            includeInactive,
            strict,
            watch,
            intervalMs,
            steadyIntervalMs,
            timeoutMs,
            untilHealthy,
            maxWaitMs,
            logVerbosity: logVerbosity.value,
            logVerbositySource: logVerbosity.source,
        },
        warnings: methodResult.warnings,
    };
}
/** Returns true when an HTTP status code should count as a healthy probe response. */
export function LocalEdgeCore_isHealthyHttpStatusCode(statusCode) {
    return statusCode !== null && statusCode >= 200 && statusCode < 400;
}
/** Classifies transport-layer probe errors separately from upstream HTTP responses. */
export function LocalEdgeCore_classifyHealthcheckErrorDomain(message) {
    if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up|TLS connection was established|timeout/i.test(message)) {
        return "router";
    }
    return "application";
}
/** Builds a non-root status path with local-edge probe query parameters. */
export function LocalEdgeCore_buildHealthcheckRequestPath(options) {
    if (options.statusPath === "/") {
        throw new Error(`[${options.commandLabel}] Surface '${options.surface}' is configured to probe '/'. Add a cheap status endpoint and use that path instead.`);
    }
    const normalizedPath = options.statusPath.startsWith("/")
        ? options.statusPath
        : `/${options.statusPath}`;
    const separator = normalizedPath.includes("?") ? "&" : "?";
    const searchParams = new URLSearchParams({
        le_probe: "1",
        le_surface: options.surface,
        le_method: options.method,
    });
    return `${normalizedPath}${separator}${searchParams.toString()}`;
}
/** Builds a stable string key for deduplicating one probe across watch iterations. */
export function LocalEdgeCore_healthProbeKey(probe) {
    return `${probe.realmSlug}::${probe.method}::${probe.surface}`;
}
/** Single-pass rollup of per-probe failure domains for one watch iteration. */
export function LocalEdgeCore_computeHealthProbeRollups(probes) {
    let failedProbeCount = 0;
    let applicationFailedProbeCount = 0;
    let routerFailedProbeCount = 0;
    for (const probe of probes) {
        if (!probe.healthy) {
            failedProbeCount += 1;
        }
        if (probe.failureDomain === "application") {
            applicationFailedProbeCount += 1;
        }
        if (probe.failureDomain === "router") {
            routerFailedProbeCount += 1;
        }
    }
    return {
        failedProbeCount,
        applicationFailedProbeCount,
        routerFailedProbeCount,
        healthyProbeCount: probes.length - failedProbeCount,
    };
}
/** Deterministic fingerprint of which probes are healthy for stabilization tracking. */
export function LocalEdgeCore_computeHealthFingerprint(probes) {
    return probes
        .map((probe) => `${LocalEdgeCore_healthProbeKey(probe)}:${probe.healthy ? "1" : "0"}`)
        .sort()
        .join("|");
}
/** Advances consecutive-stable-cycle counters when the fingerprint matches the prior cycle. */
export function LocalEdgeCore_tickHealthFingerprintStability(options) {
    if (options.currentHealthFingerprint === options.previousHealthFingerprint) {
        return {
            consecutiveStableCycles: options.consecutiveStableCycles + 1,
            previousHealthFingerprint: options.previousHealthFingerprint,
        };
    }
    return {
        consecutiveStableCycles: 1,
        previousHealthFingerprint: options.currentHealthFingerprint,
    };
}
/** Decides whether the current healthcheck cycle should emit the full summary and artifact path. */
export function LocalEdgeCore_shouldLogHealthSummary(options) {
    return (options.isFirstCycle ||
        options.summaryChanged ||
        options.isHeartbeat ||
        options.hasAnyUnhealthy ||
        options.isVerbose ||
        !options.watch);
}
/** Checks whether strict watch mode exhausted its wait budget with remaining failures. */
export function LocalEdgeCore_shouldFailStrictHealthWatch(options) {
    return (options.watch &&
        options.untilHealthy &&
        options.maxWaitMs !== null &&
        options.failedProbeCount > 0 &&
        options.strict);
}
//# sourceMappingURL=healthcheck.js.map