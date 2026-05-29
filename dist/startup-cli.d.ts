/**
 * @fileoverview Product-neutral startup CLI parsing, env projection, method resolution, and exit-code
 * contracts for local-edge-compatible adapters.
 *
 * The package owns the generic `run <command> -- <args>` argv contract and the
 * `LOCAL_EDGE_STARTUP_CLI_*` env bridge. Consumer adapters still own where implementation scripts
 * live, which processes are launched, and any product-specific runtime behavior.
 *
 * @testing Node test: cd packages/local-edge-core && npm run test
 *
 * @see packages/local-edge-kit/src/startup-cli.ts - Kit startup dispatcher that imports these argv parsers, env projection helpers, and spawn-plan builders to run configured implementation scripts behind one shared contract.
 * @see packages/local-edge-core/src/startup-cli.unit.test.ts - Node-test module that locks down parse shapes, env key mapping, method resolution, and spawn-plan output for the contracts owned here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Defines the audited file-overview tag order, single-line @testing/@see rules, and trailing @documentation metadata enforced on this module header.
 *
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Concrete local-edge router methods currently supported by the core startup contract. */
export declare const LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS: readonly ["nginx-docker"];
/** Concrete local-edge router method token accepted by the core startup contract. */
export type LocalEdgeCore_StartupCli_Method = (typeof LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS)[number];
/**
 * Exit code constants aligned with startup implementation exit conventions.
 *
 * - `success` (0): command completed normally
 * - `failure` (1): runtime or operational failure
 * - `usageError` (2): bad argv, unsupported flag, missing required value
 */
export declare const LOCAL_EDGE_STARTUP_EXIT_CODES: {
    readonly success: 0;
    readonly failure: 1;
    readonly usageError: 2;
};
/**
 * CLI process exit code produced by the local-edge startup dispatcher.
 *
 * @remarks
 * - `success` (0): command completed normally.
 * - `failure` (1): runtime or operational failure.
 * - `usageError` (2): bad argv, unsupported flag, or missing required value.
 */
export type LocalEdge_StartupCli_ExitCode = (typeof LOCAL_EDGE_STARTUP_EXIT_CODES)[keyof typeof LOCAL_EDGE_STARTUP_EXIT_CODES];
/**
 * Canonical dispatcher subcommands understood by local-edge-compatible adapters.
 */
export declare const LOCAL_EDGE_STARTUP_CLI_COMMANDS: readonly ["doctor", "ensure-running", "canonical-start", "init", "setup", "start", "stop", "launch-runtime"];
/**
 * Dispatcher subcommand id matching a thin shell stub + startup-command implementation.
 */
export type LocalEdge_StartupCli_Command = (typeof LOCAL_EDGE_STARTUP_CLI_COMMANDS)[number];
/**
 * Router method token including multi-method legacy `all` accepted by several diagnostics.
 */
export declare const LOCAL_EDGE_STARTUP_CLI_METHOD_OR_ALL: readonly ["nginx-docker", "all"];
/**
 * Method or legacy `all` selector for doctor/ensure-running/setup/stop-style CLIs.
 */
export type LocalEdge_StartupCli_MethodOrAll = (typeof LOCAL_EDGE_STARTUP_CLI_METHOD_OR_ALL)[number];
/**
 * Startup `run start` accepts only nginx-docker or all (not other future methods until wired).
 */
export declare const LOCAL_EDGE_STARTUP_CLI_START_METHODS: readonly ["nginx-docker", "all"];
/**
 * Startup `run start` method token — only `nginx-docker` or `all` are wired.
 *
 * @remarks
 * Mirrors the constraint enforced in `LocalEdge_StartupCli_isLocalEdgeMethod`. Other method
 * tokens are accepted by parsers but rejected at the overlay-validation layer.
 */
export type LocalEdge_StartupCli_StartMethod = (typeof LOCAL_EDGE_STARTUP_CLI_START_METHODS)[number];
/**
 * Strict-mode flag for the `doctor` subcommand — parsed as a string from argv.
 *
 * @remarks
 * Represented as `"true" | "false"` (not boolean) because it originates from argv parsing.
 */
export type LocalEdge_StartupCli_DoctorStrict = "true" | "false";
/**
 * Optional diagnostic flags consumed by the `doctor` subcommand.
 *
 * @remarks
 * All fields are optional; omitted fields default to the implementation's built-in defaults.
 * `strict` is a string literal (`"true" | "false"`) rather than boolean because it originates
 * from argv parsing.
 */
export type LocalEdge_StartupCli_DoctorParsedOptions = {
    applicationIntervalMs?: string;
    applicationMaxWaitMs?: string;
    applicationTimeoutMs?: string;
    skipApplication?: boolean;
    skipDns?: boolean;
    skipEdge?: boolean;
    skipRender?: boolean;
    skipSetup?: boolean;
    strict?: LocalEdge_StartupCli_DoctorStrict;
    watchApplication?: boolean;
};
/**
 * Resolved doctor argv: either explicit `--method` or inherit `local_edge_primary_method` in the impl.
 */
export type LocalEdge_StartupCli_DoctorParsed = (LocalEdge_StartupCli_DoctorParsedOptions & {
    command: "doctor";
    method: LocalEdge_StartupCli_MethodOrAll;
    methodSource: "cli";
}) | (LocalEdge_StartupCli_DoctorParsedOptions & {
    command: "doctor";
    methodSource: "primary";
});
/**
 * Discriminated union for the `ensure-running` subcommand argv.
 *
 * @remarks
 * Two variants: `methodSource: "cli"` when `--method` is passed explicitly, and
 * `methodSource: "primary"` when inheriting from `local_edge_primary_method`. The
 * `realmWasSet`/`realmValue` pair is always present regardless of method source.
 */
export type LocalEdge_StartupCli_EnsureRunningParsed = {
    command: "ensure-running";
    method: LocalEdge_StartupCli_MethodOrAll;
    methodSource: "cli";
    realmWasSet: boolean;
    realmValue: string;
    recreateIfRunning: boolean;
} | {
    command: "ensure-running";
    methodSource: "primary";
    realmWasSet: boolean;
    realmValue: string;
    recreateIfRunning: boolean;
};
/**
 * Canonical-start flags (no `--method`; audit method comes from env inside the impl).
 */
export type LocalEdge_StartupCli_CanonicalStartParsed = {
    command: "canonical-start";
    forceBootstrap: boolean;
    preflightOnly: boolean;
};
/**
 * Init normalization flags consumed by the startup CLI `run init` contract.
 */
export type LocalEdge_StartupCli_InitPromptDeveloperSlug = "auto" | "true" | "false";
/**
 * Parsed argv for the `init` subcommand.
 *
 * @remarks
 * `writeChanges` controls whether to actually write `.env.local-edge` (dry-run vs real).
 * `runChecks` controls whether to run render+setup or bootstrap after normalization.
 * `promptDeveloperSlug` and `developerSlugOverride` control developer slug resolution.
 */
export type LocalEdge_StartupCli_InitParsed = {
    command: "init";
    writeChanges: boolean;
    runChecks: boolean;
    runBootstrap: boolean;
    promptDeveloperSlug: LocalEdge_StartupCli_InitPromptDeveloperSlug;
    developerSlugOverride: string | undefined;
};
/**
 * String literal representing the resolved strict flag for `setup':
 * `"unset"` (use env defaults), `"true"` (enforce all checks),
 * or `"false"` (lenient mode).
 */
export type LocalEdge_StartupCli_SetupStrict = "unset" | "true" | "false";
/**
 * Parsed argv for the `setup` subcommand.
 *
 * @remarks
 * Two variants: `methodSource: "cli"` when `--method` is passed,
 * and `methodSource: "primary"` when inheriting from `local_edge_primary_method`.
 */
export type LocalEdge_StartupCli_SetupParsed = {
    command: "setup";
    method: LocalEdge_StartupCli_MethodOrAll;
    methodSource: "cli";
    writeArtifact: boolean;
    strict: LocalEdge_StartupCli_SetupStrict;
} | {
    command: "setup";
    methodSource: "primary";
    writeArtifact: boolean;
    strict: LocalEdge_StartupCli_SetupStrict;
};
/**
 * Parsed argv for the `start` subcommand.
 *
 * @remarks
 * Two variants: `methodSource: "cli"` when `--method` is passed,
 * and `methodSource: "primary"` when inheriting from `local_edge_primary_method`.
 * Only `nginx-docker` or `all` are accepted as explicit start method tokens.
 */
export type LocalEdge_StartupCli_StartParsed = {
    command: "start";
    method: LocalEdge_StartupCli_StartMethod;
    methodSource: "cli";
} | {
    command: "start";
    methodSource: "primary";
};
/**
 * Parsed argv for the `stop` subcommand.
 *
 * @remarks
 * Two variants: `methodSource: "cli"` when `--method` is passed,
 * and `methodSource: "primary"` when inheriting from `local_edge_primary_method`.
 */
export type LocalEdge_StartupCli_StopParsed = {
    command: "stop";
    method: LocalEdge_StartupCli_MethodOrAll;
    methodSource: "cli";
} | {
    command: "stop";
    methodSource: "primary";
};
/**
 * Parsed argv for the `launch-runtime` subcommand.
 *
 * @remarks
 * The `launch-runtime` command forwards all remaining argv tokens verbatim
 * to the launched runtime process without validation at the CLI layer.
 */
export type LocalEdge_StartupCli_LaunchRuntimeParsed = {
    command: "launch-runtime";
    forwardedArgs: string[];
};
/**
 * Discriminated union of all parsed startup CLI payloads.
 */
export type LocalEdge_StartupCli_Parsed = LocalEdge_StartupCli_DoctorParsed | LocalEdge_StartupCli_EnsureRunningParsed | LocalEdge_StartupCli_CanonicalStartParsed | LocalEdge_StartupCli_InitParsed | LocalEdge_StartupCli_SetupParsed | LocalEdge_StartupCli_StartParsed | LocalEdge_StartupCli_StopParsed | LocalEdge_StartupCli_LaunchRuntimeParsed;
/**
 * Explicit phases for canonical-start preflight vs bootstrap recovery (impl-owned ordering).
 */
export declare const LOCAL_EDGE_STARTUP_CLI_CANONICAL_PHASES: readonly ["env-and-init", "audit-or-bootstrap", "preflight-only-exit", "final-preflight", "handoff-runtime"];
/**
 * Ordered phases for `canonical-start` preflight vs bootstrap recovery.
 *
 * @remarks
 * The phase ordering is owned by the implementation; this type exists to make the sequence
 * explicit in the type system and prevent accidental reordering.
 */
export type LocalEdge_StartupCli_CanonicalPhase = (typeof LOCAL_EDGE_STARTUP_CLI_CANONICAL_PHASES)[number];
/**
 * Narrows a string to `LocalEdge_Method` when it matches the supported router implementation id.
 *
 * @remarks
 * Legacy `all` is handled in parsers before this guard; only concrete methods reach overlay validation.
 */
export declare function LocalEdge_StartupCli_isLocalEdgeMethod(value: string): value is LocalEdgeCore_StartupCli_Method;
/**
 * Parse failure for startup-cli argv; mirrors thin-shell usage exits (default code 2).
 *
 * @remarks
 * Message strings intentionally match the legacy adapter stderr lines for drop-in parity.
 */
export declare class LocalEdgeStartupCliParseError extends Error {
    readonly exitCode: number;
    /**
     * Builds a startup-cli argv parse failure with an optional usage exit-code override.
     *
     * @remarks
     * Defaults to `LOCAL_EDGE_STARTUP_EXIT_CODES.usageError`; keep message text aligned with legacy
     * legacy adapter stderr for operator parity.
     */
    constructor(message: string, options?: {
        exitCode?: number;
    });
}
/**
 * Parses `doctor` argv after the dispatcher removed the `run doctor` prefix.
 */
export declare function LocalEdgeStartupCli_parseDoctor(argv: string[]): LocalEdge_StartupCli_DoctorParsed;
/**
 * Parses `ensure-running` argv.
 */
export declare function LocalEdgeStartupCli_parseEnsureRunning(argv: string[]): LocalEdge_StartupCli_EnsureRunningParsed;
/**
 * Parses `canonical-start` argv.
 */
export declare function LocalEdgeStartupCli_parseCanonicalStart(argv: string[]): LocalEdge_StartupCli_CanonicalStartParsed;
/**
 * Parses `init` argv.
 */
export declare function LocalEdgeStartupCli_parseInit(argv: string[]): LocalEdge_StartupCli_InitParsed;
/**
 * Parses `setup` argv.
 */
export declare function LocalEdgeStartupCli_parseSetup(argv: string[]): LocalEdge_StartupCli_SetupParsed;
/**
 * Parses `start` argv.
 */
export declare function LocalEdgeStartupCli_parseStart(argv: string[]): LocalEdge_StartupCli_StartParsed;
/**
 * Parses `stop` argv.
 */
export declare function LocalEdgeStartupCli_parseStop(argv: string[]): LocalEdge_StartupCli_StopParsed;
/**
 * Routes a dispatcher subcommand string to the matching per-command parser.
 *
 * @remarks
 * Unknown commands are rejected inside `LocalEdgeStartupCli_assertCommand` before parsing body flags.
 */
export declare function LocalEdgeStartupCli_parseCommand(command: string, argv: string[]): LocalEdge_StartupCli_Parsed;
/**
 * Result of method resolution: concrete method string, source, and deprecation flag.
 */
export type LocalEdgeStartupCli_ResolvedMethod = {
    /** Concrete method or `"all"` (only when not deprecated for this command). */
    method: string;
    /** Whether the value came from `--method` on the CLI or from `LOCAL_EDGE_PRIMARY_METHOD`. */
    source: "cli" | "primary";
    /** True when `--method all` was resolved to the primary method with a deprecation warning. */
    allDeprecationApplied: boolean;
};
/**
 * Resolves the concrete method for a parsed startup CLI command.
 *
 * @returns Resolved method for method-aware commands, or `undefined` for commands
 *          without method semantics (canonical-start, init, launch-runtime).
 */
export declare function LocalEdgeStartupCli_resolveMethod(options: {
    parsed: LocalEdge_StartupCli_Parsed;
    env: Record<string, string | undefined>;
}): LocalEdgeStartupCli_ResolvedMethod | undefined;
/** Env prefix applied to all impl runs for observability. */
export declare const LOCAL_EDGE_STARTUP_CLI_ACTIVE_ENV = "LOCAL_EDGE_STARTUP_CLI_ACTIVE";
/**
 * Builds env entries for implementation consumption; does not mutate `process.env`.
 *
 * @remarks
 * PURITY: returns a fresh object suitable for spreading with `process.env` in the dispatcher only.
 */
export declare function LocalEdgeStartupCli_applyParsedToEnv(parsed: LocalEdge_StartupCli_Parsed): Record<string, string>;
/**
 * Merges resolved method entries into an env record for implementation consumption.
 *
 * @remarks
 * Called by the dispatcher after `applyParsedToEnv` for method-aware commands.
 */
export declare function LocalEdgeStartupCli_applyResolvedMethodToEnv(resolved: LocalEdgeStartupCli_ResolvedMethod, out: Record<string, string>): void;
/** Returns the implementation filename historically associated with a startup command. */
export declare function LocalEdgeStartupCli_resolveImplBaseName(command: LocalEdge_StartupCli_Command): string;
/** Renders the startup dispatcher usage banner with a caller-supplied invocation string. */
export declare function LocalEdgeStartupCli_renderUsage(options: {
    invocation: string;
}): string;
/** Product-neutral process plan returned to adapters that execute startup command bodies. */
export type LocalEdgeStartupCli_ImplSpawnPlan = {
    /** Command to pass to a process runner, e.g. `npx` for TypeScript impls or `bash` for shell impls. */
    spawnCommand: "npx" | "bash";
    /** Arguments to pass to the process runner. */
    spawnArgv: string[];
    /** Environment map for the child process. */
    env: Record<string, string | undefined>;
    /** Optional warning line the adapter should emit before spawning. */
    deprecationWarningLine: string | null;
};
/** Builds a spawn plan without checking the filesystem or executing a subprocess. */
export declare function LocalEdgeStartupCli_buildImplSpawnPlan(options: {
    extraArgs?: readonly string[];
    implBaseName: string;
    implPath: string;
    parsed: LocalEdge_StartupCli_Parsed;
    env: Record<string, string | undefined>;
}): LocalEdgeStartupCli_ImplSpawnPlan;
//# sourceMappingURL=startup-cli.d.ts.map