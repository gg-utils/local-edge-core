/**
 * @fileoverview Minimal package-core CLI shell that parses shared local-edge flags, validates
 * render-style method argv via the method-config contract, and prints a neutral dry-run plan.
 *
 * This file owns argv parsing, help/dry-run JSON or text rendering, and the `LocalEdgeCore_runCli`
 * process-style entry used by the package bin; host mutations and adapter manifests stay outside
 * this boundary until later migration waves.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/cli.unit.test.ts
 *
 * @see packages/local-edge-core/src/method-config.ts - Shared method CSV and `--method` validation helpers consumed by `LocalEdgeCore_parseRenderCliArgs` when enforcing supported methods.
 * @see packages/local-edge-core/src/bin/local-edge.ts - Package bin entrypoint that forwards process argv into `LocalEdgeCore_runCli` for the published `@gg-utils/local-edge-core/cli` surface.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository contract defining the audited file-overview tag order and `@documentation` metadata used by this header.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Parsed global CLI flags shared by future package-core commands. */
export type LocalEdgeCore_CliParseResult = {
    dryRun: boolean;
    format: "text" | "json";
    manifestPath: string | null;
    help: boolean;
};
/** Parses the package-core CLI shell flags without executing host mutations. */
export declare function LocalEdgeCore_parseCliArgs(args: readonly string[]): LocalEdgeCore_CliParseResult;
/** Parsed method/mode options for render-style local-edge commands. */
export type LocalEdgeCore_RenderCliOptions = {
    method: "all" | string;
    mode: "execute" | "check";
};
/** Parses render command argv without loading env or writing artifacts. */
export declare function LocalEdgeCore_parseRenderCliArgs(options: {
    args: readonly string[];
    defaultMethod: string;
    supportedMethods: readonly string[];
    commandLabel: string;
}): LocalEdgeCore_RenderCliOptions;
/** Renders deterministic help, text, or JSON output for the current CLI shell. */
export declare function LocalEdgeCore_renderCliOutput(options: LocalEdgeCore_CliParseResult): string;
/** Runs the package-core CLI shell and returns a process-style exit code. */
export declare function LocalEdgeCore_runCli(args: readonly string[]): number;
//# sourceMappingURL=cli.d.ts.map