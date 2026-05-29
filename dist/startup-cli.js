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
export const LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS = [
    "nginx-docker",
];
/**
 * Exit code constants aligned with startup implementation exit conventions.
 *
 * - `success` (0): command completed normally
 * - `failure` (1): runtime or operational failure
 * - `usageError` (2): bad argv, unsupported flag, missing required value
 */
export const LOCAL_EDGE_STARTUP_EXIT_CODES = {
    success: 0,
    failure: 1,
    usageError: 2,
};
/**
 * Canonical dispatcher subcommands understood by local-edge-compatible adapters.
 */
export const LOCAL_EDGE_STARTUP_CLI_COMMANDS = [
    "doctor",
    "ensure-running",
    "canonical-start",
    "init",
    "setup",
    "start",
    "stop",
    "launch-runtime",
];
/**
 * Router method token including multi-method legacy `all` accepted by several diagnostics.
 */
export const LOCAL_EDGE_STARTUP_CLI_METHOD_OR_ALL = [
    "nginx-docker",
    "all",
];
/**
 * Startup `run start` accepts only nginx-docker or all (not other future methods until wired).
 */
export const LOCAL_EDGE_STARTUP_CLI_START_METHODS = [
    "nginx-docker",
    "all",
];
/**
 * Explicit phases for canonical-start preflight vs bootstrap recovery (impl-owned ordering).
 */
export const LOCAL_EDGE_STARTUP_CLI_CANONICAL_PHASES = [
    "env-and-init",
    "audit-or-bootstrap",
    "preflight-only-exit",
    "final-preflight",
    "handoff-runtime",
];
/**
 * Narrows a string to `LocalEdge_Method` when it matches the supported router implementation id.
 *
 * @remarks
 * Legacy `all` is handled in parsers before this guard; only concrete methods reach overlay validation.
 */
export function LocalEdge_StartupCli_isLocalEdgeMethod(value) {
    return value === "nginx-docker";
}
/**
 * Parse failure for startup-cli argv; mirrors thin-shell usage exits (default code 2).
 *
 * @remarks
 * Message strings intentionally match the legacy adapter stderr lines for drop-in parity.
 */
export class LocalEdgeStartupCliParseError extends Error {
    exitCode;
    /**
     * Builds a startup-cli argv parse failure with an optional usage exit-code override.
     *
     * @remarks
     * Defaults to `LOCAL_EDGE_STARTUP_EXIT_CODES.usageError`; keep message text aligned with legacy
     * legacy adapter stderr for operator parity.
     */
    constructor(message, options = {}) {
        super(message);
        this.name = "LocalEdgeStartupCliParseError";
        this.exitCode =
            options.exitCode ?? LOCAL_EDGE_STARTUP_EXIT_CODES.usageError;
    }
}
/**
 * Narrows a dispatcher token to the startup-cli command union consumed by `LocalEdgeStartupCli_parseCommand`.
 *
 * @remarks
 * PURITY: throws `LocalEdgeStartupCliParseError` with exit code 2 when `value` is not a supported subcommand string.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_assertCommand(value) {
    const allowed = [
        "doctor",
        "ensure-running",
        "canonical-start",
        "init",
        "setup",
        "start",
        "stop",
        "launch-runtime",
    ];
    if (!allowed.includes(value)) {
        throw new LocalEdgeStartupCliParseError(`[local-edge:startup-cli] Unknown command: ${value}`, { exitCode: 2 });
    }
}
/**
 * Validates `--method` arguments that permit `all` or any recognized local-edge runtime method.
 *
 * @remarks
 * Message prefix uses caller `label` (for example `local-edge:doctor`) so stderr stays traceable across commands.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_validateMethodOrAll(label, raw) {
    if (raw === "all" || LocalEdge_StartupCli_isLocalEdgeMethod(raw)) {
        return raw;
    }
    throw new LocalEdgeStartupCliParseError(`[${label}] Unsupported --method '${raw}'.`);
}
/**
 * Validates `--method` for `start`, allowing only `all` or `nginx-docker`.
 *
 * @remarks
 * Stricter than `LocalEdgeStartupCli_validateMethodOrAll`: other registered methods are rejected for this command.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_validateStartMethod(label, raw) {
    if (raw === "all" || raw === "nginx-docker") {
        return raw;
    }
    throw new LocalEdgeStartupCliParseError(`[${label}] Unsupported --method '${raw}'.`);
}
/**
 * Reads the argv token immediately after a flag, rejecting missing values and chained `--` options.
 *
 * @remarks
 * Callers must pass `index` at the flag token; returned string is the following argv element.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_requiredFlagValue(label, argv, index, flag) {
    const next = argv[index + 1];
    if (next === undefined || next.length === 0 || next.startsWith("--")) {
        throw new LocalEdgeStartupCliParseError(`[${label}] ${flag} requires a value.`);
    }
    return next;
}
/**
 * Parses `doctor` argv after the dispatcher removed the `run doctor` prefix.
 */
export function LocalEdgeStartupCli_parseDoctor(argv) {
    const label = "local-edge:doctor";
    let methodFromCli;
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--method") {
            methodFromCli = LocalEdgeStartupCli_requiredFlagValue(label, argv, index, token);
            index += 1;
            continue;
        }
        if (token === "--strict") {
            options.strict = "true";
            continue;
        }
        if (token === "--no-strict") {
            options.strict = "false";
            continue;
        }
        if (token === "--skip-render") {
            options.skipRender = true;
            continue;
        }
        if (token === "--skip-setup") {
            options.skipSetup = true;
            continue;
        }
        if (token === "--skip-dns") {
            options.skipDns = true;
            continue;
        }
        if (token === "--skip-edge") {
            options.skipEdge = true;
            continue;
        }
        if (token === "--skip-application") {
            options.skipApplication = true;
            continue;
        }
        if (token === "--watch-application") {
            options.watchApplication = true;
            continue;
        }
        if (token === "--application-interval-ms") {
            options.applicationIntervalMs = LocalEdgeStartupCli_requiredFlagValue(label, argv, index, token);
            index += 1;
            continue;
        }
        if (token === "--application-timeout-ms") {
            options.applicationTimeoutMs = LocalEdgeStartupCli_requiredFlagValue(label, argv, index, token);
            index += 1;
            continue;
        }
        if (token === "--application-max-wait-ms") {
            options.applicationMaxWaitMs = LocalEdgeStartupCli_requiredFlagValue(label, argv, index, token);
            index += 1;
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    if (methodFromCli === undefined) {
        return { command: "doctor", methodSource: "primary", ...options };
    }
    return {
        command: "doctor",
        methodSource: "cli",
        method: LocalEdgeStartupCli_validateMethodOrAll(label, methodFromCli),
        ...options,
    };
}
/**
 * Parses `ensure-running` argv.
 */
export function LocalEdgeStartupCli_parseEnsureRunning(argv) {
    const label = "local-edge:ensure-running";
    let methodFromCli;
    let realmWasSet = false;
    let realmValue = "";
    let recreateIfRunning = false;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--method") {
            const next = argv[index + 1];
            if (next === undefined || next.length === 0) {
                throw new LocalEdgeStartupCliParseError(`[${label}] --method requires a value.`);
            }
            methodFromCli = next;
            index += 1;
            continue;
        }
        if (token === "--realm") {
            const next = argv[index + 1];
            realmWasSet = true;
            if (next === undefined) {
                realmValue = "";
            }
            else {
                realmValue = next;
                index += 1;
            }
            continue;
        }
        if (token === "--recreate-if-running") {
            recreateIfRunning = true;
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    if (methodFromCli === undefined) {
        return {
            command: "ensure-running",
            methodSource: "primary",
            realmWasSet,
            realmValue,
            recreateIfRunning,
        };
    }
    return {
        command: "ensure-running",
        method: LocalEdgeStartupCli_validateMethodOrAll(label, methodFromCli),
        methodSource: "cli",
        realmWasSet,
        realmValue,
        recreateIfRunning,
    };
}
/**
 * Parses `canonical-start` argv.
 */
export function LocalEdgeStartupCli_parseCanonicalStart(argv) {
    const label = "local-edge:canonical";
    let forceBootstrap = false;
    let preflightOnly = false;
    for (const token of argv) {
        if (token === "--force-bootstrap") {
            forceBootstrap = true;
            continue;
        }
        if (token === "--preflight-only") {
            preflightOnly = true;
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    return {
        command: "canonical-start",
        forceBootstrap,
        preflightOnly,
    };
}
/**
 * Consumes one init argv token (and optional value); returns next index to read.
 */
function LocalEdgeStartupCli_consumeInitArg(label, argv, index, state) {
    const token = argv[index];
    if (token === "--dry-run") {
        state.writeChanges = false;
        return index + 1;
    }
    if (token === "--no-checks") {
        state.runChecks = false;
        return index + 1;
    }
    if (token === "--bootstrap") {
        state.runBootstrap = true;
        return index + 1;
    }
    if (token === "--no-bootstrap") {
        state.runBootstrap = false;
        return index + 1;
    }
    if (token === "--developer-slug") {
        const next = argv[index + 1];
        if (next === undefined || next.length === 0) {
            throw new LocalEdgeStartupCliParseError(`[${label}] --developer-slug requires a value.`);
        }
        state.developerSlugOverride = next;
        return index + 2;
    }
    if (token === "--prompt-developer-slug") {
        state.promptDeveloperSlug = "true";
        return index + 1;
    }
    if (token === "--no-prompt-developer-slug") {
        state.promptDeveloperSlug = "false";
        return index + 1;
    }
    throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
}
/**
 * Parses `init` argv.
 */
export function LocalEdgeStartupCli_parseInit(argv) {
    const label = "local-edge:init";
    const state = {
        developerSlugOverride: undefined,
        promptDeveloperSlug: "auto",
        runBootstrap: false,
        runChecks: true,
        writeChanges: true,
    };
    let index = 0;
    while (index < argv.length) {
        index = LocalEdgeStartupCli_consumeInitArg(label, argv, index, state);
    }
    return {
        command: "init",
        developerSlugOverride: state.developerSlugOverride,
        promptDeveloperSlug: state.promptDeveloperSlug,
        runBootstrap: state.runBootstrap,
        runChecks: state.runChecks,
        writeChanges: state.writeChanges,
    };
}
/**
 * Parses `setup` argv.
 */
export function LocalEdgeStartupCli_parseSetup(argv) {
    const label = "local-edge:setup";
    let methodFromCli;
    let writeArtifact = true;
    let strict = "unset";
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--method") {
            const next = argv[index + 1];
            if (next === undefined || next.length === 0) {
                throw new LocalEdgeStartupCliParseError(`[${label}] --method requires a value.`);
            }
            methodFromCli = next;
            index += 1;
            continue;
        }
        if (token === "--no-artifact") {
            writeArtifact = false;
            continue;
        }
        if (token === "--strict") {
            strict = "true";
            continue;
        }
        if (token === "--no-strict") {
            strict = "false";
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    if (methodFromCli === undefined) {
        return {
            command: "setup",
            methodSource: "primary",
            writeArtifact,
            strict,
        };
    }
    return {
        command: "setup",
        method: LocalEdgeStartupCli_validateMethodOrAll(label, methodFromCli),
        methodSource: "cli",
        writeArtifact,
        strict,
    };
}
/**
 * Parses `start` argv.
 */
export function LocalEdgeStartupCli_parseStart(argv) {
    const label = "local-edge:start";
    let methodFromCli;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--method") {
            const next = argv[index + 1];
            if (next === undefined || next.length === 0) {
                throw new LocalEdgeStartupCliParseError(`[${label}] --method requires a value.`);
            }
            methodFromCli = next;
            index += 1;
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    if (methodFromCli === undefined) {
        return { command: "start", methodSource: "primary" };
    }
    return {
        command: "start",
        methodSource: "cli",
        method: LocalEdgeStartupCli_validateStartMethod(label, methodFromCli),
    };
}
/**
 * Parses `stop` argv.
 */
export function LocalEdgeStartupCli_parseStop(argv) {
    const label = "local-edge:stop";
    let methodFromCli;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--method") {
            const next = argv[index + 1];
            if (next === undefined || next.length === 0) {
                throw new LocalEdgeStartupCliParseError(`[${label}] --method requires a value.`);
            }
            methodFromCli = next;
            index += 1;
            continue;
        }
        throw new LocalEdgeStartupCliParseError(`[${label}] Unknown option: ${token}`);
    }
    if (methodFromCli === undefined) {
        return {
            command: "stop",
            methodSource: "primary",
        };
    }
    return {
        command: "stop",
        method: LocalEdgeStartupCli_validateMethodOrAll(label, methodFromCli),
        methodSource: "cli",
    };
}
/**
 * Routes a dispatcher subcommand string to the matching per-command parser.
 *
 * @remarks
 * Unknown commands are rejected inside `LocalEdgeStartupCli_assertCommand` before parsing body flags.
 */
export function LocalEdgeStartupCli_parseCommand(command, argv) {
    LocalEdgeStartupCli_assertCommand(command);
    switch (command) {
        case "doctor":
            return LocalEdgeStartupCli_parseDoctor(argv);
        case "ensure-running":
            return LocalEdgeStartupCli_parseEnsureRunning(argv);
        case "canonical-start":
            return LocalEdgeStartupCli_parseCanonicalStart(argv);
        case "init":
            return LocalEdgeStartupCli_parseInit(argv);
        case "setup":
            return LocalEdgeStartupCli_parseSetup(argv);
        case "start":
            return LocalEdgeStartupCli_parseStart(argv);
        case "stop":
            return LocalEdgeStartupCli_parseStop(argv);
        case "launch-runtime":
            return { command: "launch-runtime", forwardedArgs: argv };
        default: {
            const exhaustive = command;
            throw new Error(`Unhandled command: ${String(exhaustive)}`);
        }
    }
}
/**
 * Commands where `--method all` is deprecated and resolves to the primary method.
 * Other method-aware commands (`doctor`, `start`, `stop`) pass `all` through as operational.
 */
const ALL_DEPRECATED_COMMANDS = new Set([
    "setup",
    "ensure-running",
]);
/**
 * Commands that accept a `--method` flag and emit a resolved method.
 */
const METHOD_AWARE_COMMANDS = new Set([
    "doctor",
    "ensure-running",
    "setup",
    "start",
    "stop",
]);
/**
 * Reads the configured primary local-edge method from a captured environment map.
 *
 * @remarks
 * Defaults to `nginx-docker` when unset. Empty strings are rejected to avoid silent misconfiguration.
 *
 * @param env - Environment snapshot containing `LOCAL_EDGE_PRIMARY_METHOD` (typically `process.env`).
 * @returns Non-empty primary method string used when the CLI defers to primary.
 * @throws {LocalEdgeStartupCliParseError} When `LOCAL_EDGE_PRIMARY_METHOD` is set but empty.
 */
function LocalEdgeStartupCli_readPrimaryMethod(env) {
    const value = env.LOCAL_EDGE_PRIMARY_METHOD ?? "nginx-docker";
    if (value.length === 0) {
        throw new LocalEdgeStartupCliParseError("[local-edge:startup-cli] LOCAL_EDGE_PRIMARY_METHOD is empty.");
    }
    return value;
}
/**
 * Validates a candidate method against supported `LOCAL_EDGE_METHODS` or the operational `all` sentinel.
 *
 * @remarks
 * Keeps validation centralized so error messages consistently include the caller-provided command label.
 *
 * @param label - Error prefix bracketed in user-facing messages, such as `local-edge:setup`.
 * @param method - Method literal from CLI resolution or primary read.
 * @throws {LocalEdgeStartupCliParseError} When `method` is neither `all` nor a listed `LOCAL_EDGE_METHODS` value.
 */
function LocalEdgeStartupCli_validateMethod(label, method) {
    if (method !== "all" &&
        !LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS.includes(method)) {
        throw new LocalEdgeStartupCliParseError(`[${label}] Unsupported --method '${method}'.`);
    }
}
/**
 * Resolves the concrete method for a parsed startup CLI command.
 *
 * @returns Resolved method for method-aware commands, or `undefined` for commands
 *          without method semantics (canonical-start, init, launch-runtime).
 */
export function LocalEdgeStartupCli_resolveMethod(options) {
    const { parsed, env } = options;
    if (!METHOD_AWARE_COMMANDS.has(parsed.command)) {
        return undefined;
    }
    const label = `local-edge:${parsed.command}`;
    if (!("methodSource" in parsed)) {
        return undefined;
    }
    let method;
    let source;
    if (parsed.methodSource === "primary") {
        method = LocalEdgeStartupCli_readPrimaryMethod(env);
        source = "primary";
    }
    else if ("method" in parsed && typeof parsed.method === "string") {
        method = parsed.method;
        source = "cli";
    }
    else {
        return undefined;
    }
    LocalEdgeStartupCli_validateMethod(label, method);
    if (method === "all" && ALL_DEPRECATED_COMMANDS.has(parsed.command)) {
        const primary = LocalEdgeStartupCli_readPrimaryMethod(env);
        return {
            method: primary,
            source,
            allDeprecationApplied: true,
        };
    }
    return {
        method,
        source,
        allDeprecationApplied: false,
    };
}
/** Env prefix applied to all impl runs for observability. */
export const LOCAL_EDGE_STARTUP_CLI_ACTIVE_ENV = "LOCAL_EDGE_STARTUP_CLI_ACTIVE";
/**
 * Maps `doctor` parse output into `LOCAL_EDGE_STARTUP_CLI_DOCTOR_*` env entries for shell impls.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Doctor-only flags and method / timing knobs from the typed CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_doctorEnv(parsed, out) {
    if (parsed.strict !== undefined) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_STRICT = parsed.strict;
    }
    if (parsed.skipRender === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_RENDER = "1";
    }
    if (parsed.skipSetup === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_SETUP = "1";
    }
    if (parsed.skipDns === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_DNS = "1";
    }
    if (parsed.skipEdge === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_EDGE = "1";
    }
    if (parsed.skipApplication === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_APPLICATION = "1";
    }
    if (parsed.watchApplication === true) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_WATCH_APPLICATION = "1";
    }
    if (parsed.applicationIntervalMs !== undefined) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_APPLICATION_INTERVAL_MS =
            parsed.applicationIntervalMs;
    }
    if (parsed.applicationTimeoutMs !== undefined) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_APPLICATION_TIMEOUT_MS =
            parsed.applicationTimeoutMs;
    }
    if (parsed.applicationMaxWaitMs !== undefined) {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_APPLICATION_MAX_WAIT_MS =
            parsed.applicationMaxWaitMs;
    }
    if (parsed.methodSource === "primary") {
        out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_METHOD_USE_PRIMARY = "1";
        return;
    }
    out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_METHOD_USE_PRIMARY = "0";
    out.LOCAL_EDGE_STARTUP_CLI_DOCTOR_METHOD = parsed.method;
}
/**
 * Maps `ensure-running` parse output into ensure and realm env keys for impl scripts.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Realm value, recreate policy, and method fields from the CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_ensureRunningEnv(parsed, out) {
    if (parsed.methodSource === "primary") {
        out.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD_USE_PRIMARY = "1";
    }
    else {
        out.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD_USE_PRIMARY = "0";
        out.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD = parsed.method;
    }
    out.LOCAL_EDGE_STARTUP_CLI_ENSURE_REALM_WAS_SET = parsed.realmWasSet
        ? "1"
        : "0";
    out.LOCAL_EDGE_STARTUP_CLI_ENSURE_REALM_VALUE = parsed.realmValue;
    out.LOCAL_EDGE_STARTUP_CLI_ENSURE_RECREATE = parsed.recreateIfRunning
        ? "1"
        : "0";
}
/**
 * Maps `init` parse output into `LOCAL_EDGE_STARTUP_CLI_INIT_*` env entries.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Init phase toggles and developer-slug fields from the CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_initEnv(parsed, out) {
    out.LOCAL_EDGE_STARTUP_CLI_INIT_WRITE_CHANGES = parsed.writeChanges
        ? "1"
        : "0";
    out.LOCAL_EDGE_STARTUP_CLI_INIT_RUN_CHECKS = parsed.runChecks ? "1" : "0";
    out.LOCAL_EDGE_STARTUP_CLI_INIT_RUN_BOOTSTRAP = parsed.runBootstrap
        ? "1"
        : "0";
    out.LOCAL_EDGE_STARTUP_CLI_INIT_PROMPT_DEVELOPER_SLUG =
        parsed.promptDeveloperSlug;
    if (parsed.developerSlugOverride !== undefined) {
        out.LOCAL_EDGE_STARTUP_CLI_INIT_DEVELOPER_SLUG_OVERRIDE =
            parsed.developerSlugOverride;
    }
}
/**
 * Maps `setup` parse output into `LOCAL_EDGE_STARTUP_CLI_SETUP_*` env entries.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Setup method selection, artifact write toggle, and strictness from the parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_setupEnv(parsed, out) {
    if (parsed.methodSource === "primary") {
        out.LOCAL_EDGE_STARTUP_CLI_SETUP_METHOD_USE_PRIMARY = "1";
    }
    else {
        out.LOCAL_EDGE_STARTUP_CLI_SETUP_METHOD_USE_PRIMARY = "0";
        out.LOCAL_EDGE_STARTUP_CLI_SETUP_METHOD = parsed.method;
    }
    out.LOCAL_EDGE_STARTUP_CLI_SETUP_WRITE_ARTIFACT = parsed.writeArtifact
        ? "1"
        : "0";
    out.LOCAL_EDGE_STARTUP_CLI_SETUP_STRICT = parsed.strict;
}
/**
 * Maps `start` parse output into `LOCAL_EDGE_STARTUP_CLI_START_*` method env entries.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Start command method selection from the CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_startEnv(parsed, out) {
    if (parsed.methodSource === "primary") {
        out.LOCAL_EDGE_STARTUP_CLI_START_METHOD_USE_PRIMARY = "1";
        return;
    }
    out.LOCAL_EDGE_STARTUP_CLI_START_METHOD_USE_PRIMARY = "0";
    out.LOCAL_EDGE_STARTUP_CLI_START_METHOD = parsed.method;
}
/**
 * Maps `stop` parse output into `LOCAL_EDGE_STARTUP_CLI_STOP_*` method env entries.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Stop command method selection from the CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_stopEnv(parsed, out) {
    if (parsed.methodSource === "primary") {
        out.LOCAL_EDGE_STARTUP_CLI_STOP_METHOD_USE_PRIMARY = "1";
        return;
    }
    out.LOCAL_EDGE_STARTUP_CLI_STOP_METHOD_USE_PRIMARY = "0";
    out.LOCAL_EDGE_STARTUP_CLI_STOP_METHOD = parsed.method;
}
/**
 * Builds env entries for implementation consumption; does not mutate `process.env`.
 *
 * @remarks
 * PURITY: returns a fresh object suitable for spreading with `process.env` in the dispatcher only.
 */
export function LocalEdgeStartupCli_applyParsedToEnv(parsed) {
    const out = {
        [LOCAL_EDGE_STARTUP_CLI_ACTIVE_ENV]: "1",
    };
    switch (parsed.command) {
        case "doctor":
            LocalEdgeStartupCli_doctorEnv(parsed, out);
            break;
        case "ensure-running":
            LocalEdgeStartupCli_ensureRunningEnv(parsed, out);
            break;
        case "canonical-start":
            out.LOCAL_EDGE_STARTUP_CLI_CANONICAL_FORCE_BOOTSTRAP =
                parsed.forceBootstrap ? "1" : "0";
            out.LOCAL_EDGE_STARTUP_CLI_CANONICAL_PREFLIGHT_ONLY = parsed.preflightOnly
                ? "1"
                : "0";
            break;
        case "init":
            LocalEdgeStartupCli_initEnv(parsed, out);
            break;
        case "setup":
            LocalEdgeStartupCli_setupEnv(parsed, out);
            break;
        case "start":
            LocalEdgeStartupCli_startEnv(parsed, out);
            break;
        case "stop":
            LocalEdgeStartupCli_stopEnv(parsed, out);
            break;
        case "launch-runtime":
            break;
        default: {
            const exhaustive = parsed;
            throw new Error(`Unhandled parsed payload: ${String(exhaustive)}`);
        }
    }
    return out;
}
/**
 * Merges resolved method entries into an env record for implementation consumption.
 *
 * @remarks
 * Called by the dispatcher after `applyParsedToEnv` for method-aware commands.
 */
export function LocalEdgeStartupCli_applyResolvedMethodToEnv(resolved, out) {
    out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD = resolved.method;
    out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_SOURCE = resolved.source;
    out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_ALL_DEPRECATED =
        resolved.allDeprecationApplied ? "1" : "0";
}
/** Returns the implementation filename historically associated with a startup command. */
export function LocalEdgeStartupCli_resolveImplBaseName(command) {
    const map = {
        doctor: "doctor-impl.ts",
        "ensure-running": "ensure-running-impl.ts",
        "canonical-start": "canonical-start.impl.sh",
        init: "init-impl.ts",
        setup: "setup-impl.ts",
        start: "start-impl.ts",
        stop: "stop-impl.ts",
        "launch-runtime": "launch-runtime.impl.sh",
    };
    return map[command];
}
/** Renders the startup dispatcher usage banner with a caller-supplied invocation string. */
export function LocalEdgeStartupCli_renderUsage(options) {
    return `Usage: ${options.invocation} run <command> [-- <args>]

Commands:
  doctor           Diagnostics (registry, setup, status, dns-audit, healthcheck; supports audit skip/watch flags)
  ensure-running   Ensure router method is running (nginx-docker)
  canonical-start  Canonical HTTPS local-edge preflight then interactive runtime
  init             Normalize .env.local-edge and run validation
  setup            Validate local-edge setup for a method
  start            Start a local-edge method (nginx-docker or all)
  stop             Stop a local-edge method
  launch-runtime   Concurrent platform dev services behind local-edge (TS orchestration)
`;
}
/** Builds a spawn plan without checking the filesystem or executing a subprocess. */
export function LocalEdgeStartupCli_buildImplSpawnPlan(options) {
    const envEntries = LocalEdgeStartupCli_applyParsedToEnv(options.parsed);
    const resolved = LocalEdgeStartupCli_resolveMethod({
        parsed: options.parsed,
        env: options.env,
    });
    let deprecationWarningLine = null;
    if (resolved !== undefined) {
        LocalEdgeStartupCli_applyResolvedMethodToEnv(resolved, envEntries);
        if (resolved.allDeprecationApplied) {
            deprecationWarningLine =
                `[local-edge:${options.parsed.command}] WARNING: --method all is` +
                    ` deprecated in single-method mode. Using primary method` +
                    ` '${resolved.method}'.`;
        }
    }
    const isTsImpl = options.implBaseName.endsWith(".ts");
    const extraArgs = [...(options.extraArgs ?? [])];
    return {
        spawnCommand: isTsImpl ? "npx" : "bash",
        spawnArgv: isTsImpl
            ? ["tsx", options.implPath, ...extraArgs]
            : [options.implPath, ...extraArgs],
        env: {
            ...options.env,
            ...envEntries,
        },
        deprecationWarningLine,
    };
}
//# sourceMappingURL=startup-cli.js.map