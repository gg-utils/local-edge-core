/**
 * @fileoverview Product-neutral with-logs lifecycle line and argv parsing helpers.
 *
 * Core owns the stable shutdown prefix, formatter-state TSV generation, lifecycle line rendering,
 * EPIPE classification, and strict subcommand parsing. Adapters own the process/signal orchestration,
 * run-log file selection, and prelude command labels.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/with-logs.unit.test.ts
 *
 * @see packages/local-edge-core/src/log-output.ts - Formatter-resolution helpers this module imports when emitting the resolve-formatter-state TSV line contract shared with shell shims.
 * @see packages/local-edge-core/src/with-logs.unit.test.ts - Node test runner coverage that exercises argv parsing, lifecycle one-liners, shutdown-prefix rules, and formatter-state emission owned here.
 * @see packages/local-edge-core/src/index.ts - Package barrel that re-exports this module so kit and script adapters share one stable with-logs contract.
 * @see scripts/local-edge/with-logs.ts - Repo-root CLI compatibility wrapper that delegates argv and prelude behavior into the consumer-specific with-logs adapter built on this core surface.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Prefix for parent-process lines mirrored to run logs during shutdown/cleanup. */
export declare const LOCAL_EDGE_CORE_WITH_LOGS_SHUTDOWN_PREFIX: "[local-edge:shutdown] ";
/** Discriminated lifecycle events for typed single-line formatting. */
export type LocalEdgeCore_WithLogsLifecycleEvent = {
    readonly kind: "checkout_kind_resolve_failed";
    readonly projectRoot: string;
} | {
    readonly kind: "reclaim_session";
    readonly projectRoot: string;
} | {
    readonly kind: "runtime_exited";
    readonly exitCode: number;
} | {
    readonly kind: "shutdown_parent_message";
    readonly message: string;
};
/** Parsed argv shape for the with-logs CLI after stripping node and script entries. */
export type LocalEdgeCore_WithLogsParseResult = {
    readonly command: "help";
} | {
    readonly command: "resolve-formatter-state";
} | {
    readonly command: "print-prelude";
    readonly logFile: string;
} | {
    readonly command: "print-shutdown-prefix";
} | {
    readonly command: "format-checkout-kind-error";
    readonly projectRoot: string;
} | {
    readonly command: "format-reclaim-notice";
    readonly projectRoot: string;
} | {
    readonly command: "format-runtime-exit";
    readonly exitCode: number;
};
/** CLI parse failure for with-logs subcommands. */
export declare class LocalEdgeCoreWithLogsCliError extends Error {
    /** Builds a named argv parse error. */
    constructor(message: string);
}
/** Renders the multi-line CLI usage synopsis for with-logs compatibility wrappers. */
export declare function LocalEdgeCore_withLogsRenderUsage(): string;
/** Prepends the shutdown parent prefix to a message string. */
export declare function LocalEdgeCore_withLogsFormatShutdownParentLine(message: string): string;
/** Formats a checkout-kind resolution failure as a single error line. */
export declare function LocalEdgeCore_withLogsFormatCheckoutKindResolveFailed(projectRoot: string): string;
/** Formats a session-reclaim notice as a single informational log line. */
export declare function LocalEdgeCore_withLogsFormatReclaimNotice(projectRoot: string): string;
/** Formats a runtime exit notice as a single shutdown-parent log line. */
export declare function LocalEdgeCore_withLogsFormatRuntimeExit(exitCode: number): string;
/** Returns true only for stdout EPIPE errors that can be ignored during force-kill cleanup. */
export declare function LocalEdgeCore_withLogsIsIgnorableStdoutError(error: unknown): boolean;
/** Maps a lifecycle event to the exact line written to the log / TTY. */
export declare function LocalEdgeCore_withLogsFormatLifecycleEvent(event: LocalEdgeCore_WithLogsLifecycleEvent): string;
/** Resolves formatter state as `<format>\t<formatterEnabled>\t<formatterActiveValue>`. */
export declare function LocalEdgeCore_withLogsResolveFormatterStateTsv(env: {
    readonly LOCAL_EDGE_LOG_OUTPUT_FORMAT?: string;
}): string;
/** Parses the with-logs argv slice into a discriminated command union. */
export declare function LocalEdgeCore_withLogsParseArgv(argv: readonly string[]): LocalEdgeCore_WithLogsParseResult;
//# sourceMappingURL=with-logs.d.ts.map