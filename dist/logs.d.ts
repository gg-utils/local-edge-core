/**
 * @fileoverview Product-neutral logs CLI parsing, selector, and line-format helpers.
 *
 * Core owns deterministic argv parsing, numeric validation, usage text, log-selector conversion, and
 * operator line prefixes. Adapters own filesystem discovery, tail process management, log directory
 * choices, and product-specific command wiring.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/logs.unit.test.ts
 *
 * @see packages/local-edge-kit/src/logs-cli.ts - Kit-side logs CLI adapter that consumes parsed argv, validation, tail argv builders, and scope file resolution from this module.
 * @see consumer local-edge adapter - consumer local-edge logs script entrypoint that depends on the same core parsing contract for operator-facing log commands.
 * @see packages/local-edge-core/src/logs.unit.test.ts - Node test module that regression-tests CLI parsing, selector precedence, path layout helpers, and scope file resolution.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** CLI subcommand token used to route tail, history, and list-runs behavior. */
export type LocalEdgeCore_LogsCommandName = "tail" | "history" | "list-runs";
/** Resolved log grouping that selects run files, infra logs, or a merged all slice. */
export type LocalEdgeCore_LogsScopeName = "run" | "nginx-docker" | "healthcheck" | "all";
/** Canonical argv-derived options after CLI parsing merges defaults and normalization. */
export type LocalEdgeCore_ParsedLogsCli = {
    readonly command: LocalEdgeCore_LogsCommandName;
    readonly scope: LocalEdgeCore_LogsScopeName;
    readonly runIndex: string;
    readonly initialLines: string;
    readonly initialChars: string;
    readonly initialTokens: string;
    readonly charsPerToken: string;
    readonly hasCharsPerTokenOverride: boolean;
    readonly timeoutSeconds: string;
};
/** Parse result that avoids process exits inside package core. */
export type LocalEdgeCore_LogsCliParseResult = {
    readonly ok: true;
    readonly parsed: LocalEdgeCore_ParsedLogsCli;
} | {
    readonly ok: false;
    readonly kind: "help" | "error";
    readonly message?: string;
    readonly includeUsage: boolean;
    readonly exitCode: 0 | 1;
};
/** Options for parsing logs CLI argv. */
export type LocalEdgeCore_ParseLogsCliOptions = {
    readonly argv: readonly string[];
    readonly defaultLines: string;
    readonly defaultCharsPerToken: string;
};
/** File layout used by local-edge logs adapters. */
export type LocalEdgeCore_LogsPathLayout = {
    readonly localEdgeLogDir: string;
    readonly runLogDir: string;
    readonly runLogLatestLink: string;
    readonly runLogPattern: string;
};
/** Filesystem predicate for candidate log files. */
export type LocalEdgeCore_LogsFileExists = (filePath: string) => boolean;
/** Resolver for indexed run log artifacts. */
export type LocalEdgeCore_LogsRunFileByIndexResolver = (indexOneBased: number) => string | undefined;
/** Options for resolving concrete files backing a parsed logs scope. */
export type LocalEdgeCore_ResolveLogsScopeFilesOptions = {
    readonly parsed: Pick<LocalEdgeCore_ParsedLogsCli, "scope" | "runIndex">;
    readonly pathLayout: LocalEdgeCore_LogsPathLayout;
    readonly fileExists: LocalEdgeCore_LogsFileExists;
    readonly resolveLatestRunLog: () => string | undefined;
    readonly resolveRunLogByIndex: LocalEdgeCore_LogsRunFileByIndexResolver;
};
/** Renders the historical long-form logs CLI usage text. */
export declare function LocalEdgeCore_renderLogsUsage(): string;
/** Formats an operator-visible info line with the logs CLI label. */
export declare function LocalEdgeCore_formatLogsInfoLine(message: string): string;
/** Formats an operator-visible error line with the logs CLI label. */
export declare function LocalEdgeCore_formatLogsErrorLine(message: string): string;
/** Parses a strictly positive integer env string with fallback. */
export declare function LocalEdgeCore_parseLogsEnvPositiveInt(raw: string | undefined, defaultValue: number): number;
/** Parses a finite numeric env string with fallback. */
export declare function LocalEdgeCore_parseLogsEnvNumber(raw: string | undefined, defaultValue: number): number;
/** Normalizes leading argv so option-first invocations behave as `tail`. */
export declare function LocalEdgeCore_normalizeLogsArgv(argv: readonly string[]): readonly string[];
/** True when `value` is a base-10 strictly positive integer string. */
export declare function LocalEdgeCore_isLogsPositiveIntString(value: string): boolean;
/** True when `value` is a non-negative decimal numeric string accepted for chars-per-token. */
export declare function LocalEdgeCore_isLogsCharsPerTokenFormat(value: string): boolean;
/** Converts token counts into character budgets using the legacy ceiling rule. */
export declare function LocalEdgeCore_logsTokensToCharBudget(options: {
    readonly tokens: number;
    readonly charsPerToken: number;
}): number;
/** Parses logs CLI argv into normalized options or a help/error result. */
export declare function LocalEdgeCore_parseLogsCli(options: LocalEdgeCore_ParseLogsCliOptions): LocalEdgeCore_LogsCliParseResult;
/** Returns the first validation error for parsed logs CLI options, if any. */
export declare function LocalEdgeCore_validateParsedLogsCli(parsed: LocalEdgeCore_ParsedLogsCli): string | null;
/** Translates parsed selectors into `tail` argv fragments honoring chars/tokens/lines priority. */
export declare function LocalEdgeCore_buildLogsFollowSelectorArgs(parsed: LocalEdgeCore_ParsedLogsCli): string[];
/** Builds blocking `tail` args for history output. */
export declare function LocalEdgeCore_buildLogsHistoryTailArgs(parsed: LocalEdgeCore_ParsedLogsCli, filePath: string): string[];
/** Builds standard local-edge logs path layout from an explicit project root. */
export declare function LocalEdgeCore_buildLogsPathLayout(projectRoot: string): LocalEdgeCore_LogsPathLayout;
/** Resolves concrete log files for the parsed scope while adapters own file existence checks. */
export declare function LocalEdgeCore_resolveLogsScopeFiles(options: LocalEdgeCore_ResolveLogsScopeFilesOptions): string[];
//# sourceMappingURL=logs.d.ts.map