/**
 * @fileoverview Owns product-neutral argv parsing, usage text, and typed parse results for local-edge shell shim subcommands consumed from bash wrappers.
 *
 * Core owns the deterministic command/flag contract used by shell wrappers. Adapters own the actual
 * subcommand side effects, product-specific URL matrix rendering, environment reads, and stdout/stderr
 * process wiring.
 * Flow: argv tail after subcommand token -> per-command flag parsing -> discriminated parse envelope or LocalEdgeCoreShellShimError.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/shell-shim.unit.test.ts
 *
 * @see consumer local-edge adapter - consumer adapter that imports parse/usage helpers here, dispatches stdout side effects, and is what `npx tsx scripts/local-edge/lib-shell-shim.ts` ultimately runs for operator workflows.
 * @see packages/local-edge-core/src/shell-shim.unit.test.ts - Node test runner regression suite asserting argv envelopes, usage banner text, and parser error messages for every subcommand shape owned by this module.
 * @see packages/local-edge-core/src/index.ts - Package public surface re-exporting this shell-shim contract next to other local-edge-core primitives.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Parsed command envelope for the shell-shim compatibility CLI. */
export type LocalEdgeCore_ShellShimParseResult = {
    readonly command: "print-prelude";
    readonly logFile: string;
} | {
    readonly command: "resolve-formatter-state";
} | {
    readonly command: "is-truthy";
    readonly value: string;
} | {
    readonly command: "collect-active-env-files";
    readonly projectRoot: string;
} | {
    readonly command: "normalize-legacy-artifact-path";
    readonly machineRoot: string;
    readonly rawPath: string;
} | {
    readonly command: "print-method-url-matrix";
    readonly method: string;
} | {
    readonly command: "resolve-log-color-enabled";
    readonly isTtyStdout: boolean;
} | {
    readonly command: "help";
};
/** Argv parsing failure for shell-shim command contracts. */
export declare class LocalEdgeCoreShellShimError extends Error {
    /** Builds an error tagged for shell-shim parser failures. */
    constructor(message: string);
}
/** Renders the shim `--help` text listing subcommands and flag shapes consumed by shell wrappers. */
export declare function LocalEdgeCore_renderShellShimUsage(): string;
/** Parses command argv where argv[0] is the shell-shim subcommand token. */
export declare function LocalEdgeCore_parseShellShimArgv(argv: readonly string[]): LocalEdgeCore_ShellShimParseResult;
//# sourceMappingURL=shell-shim.d.ts.map