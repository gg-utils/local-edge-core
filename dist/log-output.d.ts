/**
 * @fileoverview Product-neutral log output and prelude formatting helpers.
 *
 * This file owns normalized log format resolution, ANSI-aware stdout/stderr line rendering, and the
 * standard local-edge prelude text adapters assemble from injected command labels.
 * Flow: adapters resolve format/color env inputs -> helpers emit stable markers and preludes.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/log-output.unit.test.ts
 *
 * @see packages/local-edge-core/src/with-logs.ts - With-logs orchestration that imports these helpers to wire prelude output, formatter-active flags, and child-process log streaming.
 * @see packages/local-edge-core/src/index.ts - Package barrel that re-exports this module so kit-level CLIs share one stable log contract.
 * @see packages/local-edge-core/src/log-output.unit.test.ts - Node test runner coverage that asserts format normalization, color gating, prelude layout, and stream routing for the helpers owned here.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Normalized log stream shape selected by an adapter's log-output setting. */
export type LocalEdgeCore_LogOutputFormat = "formatted" | "raw";
/** Shared options accepted by core local-edge log functions. */
export type LocalEdgeCore_LogOptions = {
    colorEnabled: boolean;
};
/** Callback type for injectable logging. */
export type LocalEdgeCore_LogFn = (message: string) => void;
/** Whether a string token should be treated as truthy by local-edge compatibility wrappers. */
export declare function LocalEdgeCore_isTruthy(value: string | undefined): boolean;
/** Resolves the normalized log output format from caller-provided raw text. */
export declare function LocalEdgeCore_resolveLogOutputFormat(rawValue: string | undefined): LocalEdgeCore_LogOutputFormat;
/** Returns whether a normalized log output format enables the formatter pipeline. */
export declare function LocalEdgeCore_logFormatterEnabled(format: LocalEdgeCore_LogOutputFormat): boolean;
/** Returns the string flag exported for formatter-aware child processes. */
export declare function LocalEdgeCore_logFormatterActiveValue(format: LocalEdgeCore_LogOutputFormat): "true" | "false";
/** Computes whether ANSI color should be emitted for log prefixes. */
export declare function LocalEdgeCore_logColorEnabled(options: {
    formatterActive: boolean;
    noColor: string | undefined;
    colorMode: string | undefined;
    isTtyStdout: boolean;
}): boolean;
/** Builds the standard local-edge log prelude from explicit command labels. */
export declare function LocalEdgeCore_buildWithLogsPrelude(options: {
    logFile: string;
    tailRunLogsCommand: string;
    tailAllLogsCommand: string;
    recentRunLogCommand: string;
    runLogHistoryCommand: string;
    sectionLabel: string;
}): string;
/** Prints `[local-edge] <message>` to stdout. */
export declare function LocalEdgeCore_logInfo(message: string, options: LocalEdgeCore_LogOptions): void;
/** Prints `[local-edge] OK: <message>` to stdout. */
export declare function LocalEdgeCore_logSuccess(message: string, options: LocalEdgeCore_LogOptions): void;
/** Prints `[local-edge] WARNING: <message>` to stderr. */
export declare function LocalEdgeCore_logWarn(message: string, options: LocalEdgeCore_LogOptions): void;
/** Prints `[local-edge] ERROR: <message>` to stderr. */
export declare function LocalEdgeCore_logError(message: string, options: LocalEdgeCore_LogOptions): void;
/** Prints a section header, optionally using the formatter marker contract. */
export declare function LocalEdgeCore_logSection(title: string, options: LocalEdgeCore_LogOptions & {
    formatterActive: boolean;
}): void;
//# sourceMappingURL=log-output.d.ts.map