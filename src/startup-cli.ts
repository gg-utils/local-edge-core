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
] as const;

/** Concrete local-edge router method token accepted by the core startup contract. */
export type LocalEdgeCore_StartupCli_Method =
  (typeof LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS)[number];

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
} as const;

/**
 * CLI process exit code produced by the local-edge startup dispatcher.
 *
 * @remarks
 * - `success` (0): command completed normally.
 * - `failure` (1): runtime or operational failure.
 * - `usageError` (2): bad argv, unsupported flag, or missing required value.
 */
export type LocalEdge_StartupCli_ExitCode =
  (typeof LOCAL_EDGE_STARTUP_EXIT_CODES)[keyof typeof LOCAL_EDGE_STARTUP_EXIT_CODES];

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
] as const;

/**
 * Dispatcher subcommand id matching a thin shell stub + startup-command implementation.
 */
export type LocalEdge_StartupCli_Command =
  (typeof LOCAL_EDGE_STARTUP_CLI_COMMANDS)[number];

/**
 * Router method token including multi-method legacy `all` accepted by several diagnostics.
 */
export const LOCAL_EDGE_STARTUP_CLI_METHOD_OR_ALL = [
  "nginx-docker",
  "all",
] as const;

/**
 * Method or legacy `all` selector for doctor/ensure-running/setup/stop-style CLIs.
 */
export type LocalEdge_StartupCli_MethodOrAll =
  (typeof LOCAL_EDGE_STARTUP_CLI_METHOD_OR_ALL)[number];

/**
 * Startup `run start` accepts only nginx-docker or all (not other future methods until wired).
 */
export const LOCAL_EDGE_STARTUP_CLI_START_METHODS = [
  "nginx-docker",
  "all",
] as const;

/**
 * Startup `run start` method token — only `nginx-docker` or `all` are wired.
 *
 * @remarks
 * Mirrors the constraint enforced in `LocalEdge_StartupCli_isLocalEdgeMethod`. Other method
 * tokens are accepted by parsers but rejected at the overlay-validation layer.
 */
export type LocalEdge_StartupCli_StartMethod =
  (typeof LOCAL_EDGE_STARTUP_CLI_START_METHODS)[number];

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
export type LocalEdge_StartupCli_DoctorParsed =
  | (LocalEdge_StartupCli_DoctorParsedOptions & {
      command: "doctor";
      method: LocalEdge_StartupCli_MethodOrAll;
      methodSource: "cli";
    })
  | (LocalEdge_StartupCli_DoctorParsedOptions & {
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
export type LocalEdge_StartupCli_EnsureRunningParsed =
  | {
      command: "ensure-running";
      method: LocalEdge_StartupCli_MethodOrAll;
      methodSource: "cli";
      realmWasSet: boolean;
      realmValue: string;
      recreateIfRunning: boolean;
    }
  | {
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
export type LocalEdge_StartupCli_InitPromptDeveloperSlug =
  | "auto"
  | "true"
  | "false";

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
export type LocalEdge_StartupCli_SetupParsed =
  | {
      command: "setup";
      method: LocalEdge_StartupCli_MethodOrAll;
      methodSource: "cli";
      writeArtifact: boolean;
      strict: LocalEdge_StartupCli_SetupStrict;
    }
  | {
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
export type LocalEdge_StartupCli_StartParsed =
  | {
      command: "start";
      method: LocalEdge_StartupCli_StartMethod;
      methodSource: "cli";
    }
  | {
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
export type LocalEdge_StartupCli_StopParsed =
  | {
      command: "stop";
      method: LocalEdge_StartupCli_MethodOrAll;
      methodSource: "cli";
    }
  | {
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
export type LocalEdge_StartupCli_Parsed =
  | LocalEdge_StartupCli_DoctorParsed
  | LocalEdge_StartupCli_EnsureRunningParsed
  | LocalEdge_StartupCli_CanonicalStartParsed
  | LocalEdge_StartupCli_InitParsed
  | LocalEdge_StartupCli_SetupParsed
  | LocalEdge_StartupCli_StartParsed
  | LocalEdge_StartupCli_StopParsed
  | LocalEdge_StartupCli_LaunchRuntimeParsed;

/**
 * Explicit phases for canonical-start preflight vs bootstrap recovery (impl-owned ordering).
 */
export const LOCAL_EDGE_STARTUP_CLI_CANONICAL_PHASES = [
  "env-and-init",
  "audit-or-bootstrap",
  "preflight-only-exit",
  "final-preflight",
  "handoff-runtime",
] as const;

/**
 * Ordered phases for `canonical-start` preflight vs bootstrap recovery.
 *
 * @remarks
 * The phase ordering is owned by the implementation; this type exists to make the sequence
 * explicit in the type system and prevent accidental reordering.
 */
export type LocalEdge_StartupCli_CanonicalPhase =
  (typeof LOCAL_EDGE_STARTUP_CLI_CANONICAL_PHASES)[number];

/**
 * Narrows a string to `LocalEdge_Method` when it matches the supported router implementation id.
 *
 * @remarks
 * Legacy `all` is handled in parsers before this guard; only concrete methods reach overlay validation.
 */
export function LocalEdge_StartupCli_isLocalEdgeMethod(
  value: string,
): value is LocalEdgeCore_StartupCli_Method {
  return value === "nginx-docker";
}

/**
 * Parse failure for startup-cli argv; mirrors thin-shell usage exits (default code 2).
 *
 * @remarks
 * Message strings intentionally match the legacy adapter stderr lines for drop-in parity.
 */
export class LocalEdgeStartupCliParseError extends Error {
  public readonly exitCode: number;

  /**
   * Builds a startup-cli argv parse failure with an optional usage exit-code override.
   *
   * @remarks
   * Defaults to `LOCAL_EDGE_STARTUP_EXIT_CODES.usageError`; keep message text aligned with legacy
   * legacy adapter stderr for operator parity.
   */
  public constructor(message: string, options: { exitCode?: number } = {}) {
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
function LocalEdgeStartupCli_assertCommand(
  value: string,
): asserts value is LocalEdge_StartupCli_Command {
  const allowed: LocalEdge_StartupCli_Command[] = [
    "doctor",
    "ensure-running",
    "canonical-start",
    "init",
    "setup",
    "start",
    "stop",
    "launch-runtime",
  ];
  if (!allowed.includes(value as LocalEdge_StartupCli_Command)) {
    throw new LocalEdgeStartupCliParseError(
      `[local-edge:startup-cli] Unknown command: ${value}`,
      { exitCode: 2 },
    );
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
function LocalEdgeStartupCli_validateMethodOrAll(
  label: string,
  raw: string,
): "nginx-docker" | "all" {
  if (raw === "all" || LocalEdge_StartupCli_isLocalEdgeMethod(raw)) {
    return raw;
  }
  throw new LocalEdgeStartupCliParseError(
    `[${label}] Unsupported --method '${raw}'.`,
  );
}

/**
 * Validates `--method` for `start`, allowing only `all` or `nginx-docker`.
 *
 * @remarks
 * Stricter than `LocalEdgeStartupCli_validateMethodOrAll`: other registered methods are rejected for this command.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_validateStartMethod(
  label: string,
  raw: string,
): LocalEdge_StartupCli_StartMethod {
  if (raw === "all" || raw === "nginx-docker") {
    return raw;
  }
  throw new LocalEdgeStartupCliParseError(
    `[${label}] Unsupported --method '${raw}'.`,
  );
}

/**
 * Reads the argv token immediately after a flag, rejecting missing values and chained `--` options.
 *
 * @remarks
 * Callers must pass `index` at the flag token; returned string is the following argv element.
 *
 * @agent.internal
 */
function LocalEdgeStartupCli_requiredFlagValue(
  label: string,
  argv: string[],
  index: number,
  flag: string,
): string {
  const next = argv[index + 1];
  if (next === undefined || next.length === 0 || next.startsWith("--")) {
    throw new LocalEdgeStartupCliParseError(
      `[${label}] ${flag} requires a value.`,
    );
  }
  return next;
}

/**
 * Parses `doctor` argv after the dispatcher removed the `run doctor` prefix.
 */
export function LocalEdgeStartupCli_parseDoctor(
  argv: string[],
): LocalEdge_StartupCli_DoctorParsed {
  const label = "local-edge:doctor";
  let methodFromCli: string | undefined;
  const options: LocalEdge_StartupCli_DoctorParsedOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--method") {
      methodFromCli = LocalEdgeStartupCli_requiredFlagValue(
        label,
        argv,
        index,
        token,
      );
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
      options.applicationIntervalMs = LocalEdgeStartupCli_requiredFlagValue(
        label,
        argv,
        index,
        token,
      );
      index += 1;
      continue;
    }
    if (token === "--application-timeout-ms") {
      options.applicationTimeoutMs = LocalEdgeStartupCli_requiredFlagValue(
        label,
        argv,
        index,
        token,
      );
      index += 1;
      continue;
    }
    if (token === "--application-max-wait-ms") {
      options.applicationMaxWaitMs = LocalEdgeStartupCli_requiredFlagValue(
        label,
        argv,
        index,
        token,
      );
      index += 1;
      continue;
    }

    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
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
export function LocalEdgeStartupCli_parseEnsureRunning(
  argv: string[],
): LocalEdge_StartupCli_EnsureRunningParsed {
  const label = "local-edge:ensure-running";
  let methodFromCli: string | undefined;
  let realmWasSet = false;
  let realmValue = "";
  let recreateIfRunning = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--method") {
      const next = argv[index + 1];
      if (next === undefined || next.length === 0) {
        throw new LocalEdgeStartupCliParseError(
          `[${label}] --method requires a value.`,
        );
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
      } else {
        realmValue = next;
        index += 1;
      }
      continue;
    }
    if (token === "--recreate-if-running") {
      recreateIfRunning = true;
      continue;
    }

    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
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
export function LocalEdgeStartupCli_parseCanonicalStart(
  argv: string[],
): LocalEdge_StartupCli_CanonicalStartParsed {
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
    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
  }

  return {
    command: "canonical-start",
    forceBootstrap,
    preflightOnly,
  };
}

/**
 * Mutable scratch state while linearly scanning `init` argv into `LocalEdge_StartupCli_InitParsed`.
 *
 * @remarks
 * Baseline field values match the init command defaults before any recognized flag mutates them.
 *
 * @agent.internal
 */
type LocalEdgeStartupCli_InitParseState = {
  developerSlugOverride: string | undefined;
  promptDeveloperSlug: LocalEdge_StartupCli_InitPromptDeveloperSlug;
  runBootstrap: boolean;
  runChecks: boolean;
  writeChanges: boolean;
};

/**
 * Consumes one init argv token (and optional value); returns next index to read.
 */
function LocalEdgeStartupCli_consumeInitArg(
  label: string,
  argv: string[],
  index: number,
  state: LocalEdgeStartupCli_InitParseState,
): number {
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
      throw new LocalEdgeStartupCliParseError(
        `[${label}] --developer-slug requires a value.`,
      );
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

  throw new LocalEdgeStartupCliParseError(
    `[${label}] Unknown option: ${token}`,
  );
}

/**
 * Parses `init` argv.
 */
export function LocalEdgeStartupCli_parseInit(
  argv: string[],
): LocalEdge_StartupCli_InitParsed {
  const label = "local-edge:init";
  const state: LocalEdgeStartupCli_InitParseState = {
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
export function LocalEdgeStartupCli_parseSetup(
  argv: string[],
): LocalEdge_StartupCli_SetupParsed {
  const label = "local-edge:setup";
  let methodFromCli: string | undefined;
  let writeArtifact = true;
  let strict: LocalEdge_StartupCli_SetupStrict = "unset";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--method") {
      const next = argv[index + 1];
      if (next === undefined || next.length === 0) {
        throw new LocalEdgeStartupCliParseError(
          `[${label}] --method requires a value.`,
        );
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

    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
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
export function LocalEdgeStartupCli_parseStart(
  argv: string[],
): LocalEdge_StartupCli_StartParsed {
  const label = "local-edge:start";
  let methodFromCli: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--method") {
      const next = argv[index + 1];
      if (next === undefined || next.length === 0) {
        throw new LocalEdgeStartupCliParseError(
          `[${label}] --method requires a value.`,
        );
      }
      methodFromCli = next;
      index += 1;
      continue;
    }

    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
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
export function LocalEdgeStartupCli_parseStop(
  argv: string[],
): LocalEdge_StartupCli_StopParsed {
  const label = "local-edge:stop";
  let methodFromCli: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--method") {
      const next = argv[index + 1];
      if (next === undefined || next.length === 0) {
        throw new LocalEdgeStartupCliParseError(
          `[${label}] --method requires a value.`,
        );
      }
      methodFromCli = next;
      index += 1;
      continue;
    }

    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unknown option: ${token}`,
    );
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
export function LocalEdgeStartupCli_parseCommand(
  command: string,
  argv: string[],
): LocalEdge_StartupCli_Parsed {
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
      const exhaustive: never = command;
      throw new Error(`Unhandled command: ${String(exhaustive)}`);
    }
  }
}

/**
 * Commands where `--method all` is deprecated and resolves to the primary method.
 * Other method-aware commands (`doctor`, `start`, `stop`) pass `all` through as operational.
 */
const ALL_DEPRECATED_COMMANDS: ReadonlySet<string> = new Set([
  "setup",
  "ensure-running",
]);

/**
 * Commands that accept a `--method` flag and emit a resolved method.
 */
const METHOD_AWARE_COMMANDS: ReadonlySet<string> = new Set([
  "doctor",
  "ensure-running",
  "setup",
  "start",
  "stop",
]);

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
 * Reads the configured primary local-edge method from a captured environment map.
 *
 * @remarks
 * Defaults to `nginx-docker` when unset. Empty strings are rejected to avoid silent misconfiguration.
 *
 * @param env - Environment snapshot containing `LOCAL_EDGE_PRIMARY_METHOD` (typically `process.env`).
 * @returns Non-empty primary method string used when the CLI defers to primary.
 * @throws {LocalEdgeStartupCliParseError} When `LOCAL_EDGE_PRIMARY_METHOD` is set but empty.
 */
function LocalEdgeStartupCli_readPrimaryMethod(
  env: Record<string, string | undefined>,
): string {
  const value = env.LOCAL_EDGE_PRIMARY_METHOD ?? "nginx-docker";
  if (value.length === 0) {
    throw new LocalEdgeStartupCliParseError(
      "[local-edge:startup-cli] LOCAL_EDGE_PRIMARY_METHOD is empty.",
    );
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
function LocalEdgeStartupCli_validateMethod(
  label: string,
  method: string,
): void {
  if (
    method !== "all" &&
    !(LOCAL_EDGE_STARTUP_CLI_SUPPORTED_METHODS as readonly string[]).includes(
      method,
    )
  ) {
    throw new LocalEdgeStartupCliParseError(
      `[${label}] Unsupported --method '${method}'.`,
    );
  }
}

/**
 * Resolves the concrete method for a parsed startup CLI command.
 *
 * @returns Resolved method for method-aware commands, or `undefined` for commands
 *          without method semantics (canonical-start, init, launch-runtime).
 */
export function LocalEdgeStartupCli_resolveMethod(options: {
  parsed: LocalEdge_StartupCli_Parsed;
  env: Record<string, string | undefined>;
}): LocalEdgeStartupCli_ResolvedMethod | undefined {
  const { parsed, env } = options;

  if (!METHOD_AWARE_COMMANDS.has(parsed.command)) {
    return undefined;
  }

  const label = `local-edge:${parsed.command}`;

  if (!("methodSource" in parsed)) {
    return undefined;
  }

  let method: string;
  let source: "cli" | "primary";

  if (parsed.methodSource === "primary") {
    method = LocalEdgeStartupCli_readPrimaryMethod(env);
    source = "primary";
  } else if ("method" in parsed && typeof parsed.method === "string") {
    method = parsed.method;
    source = "cli";
  } else {
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
export const LOCAL_EDGE_STARTUP_CLI_ACTIVE_ENV =
  "LOCAL_EDGE_STARTUP_CLI_ACTIVE";

/**
 * Maps `doctor` parse output into `LOCAL_EDGE_STARTUP_CLI_DOCTOR_*` env entries for shell impls.
 *
 * @remarks
 * PURITY: mutates `out` in place; does not read `process.env`.
 *
 * @param parsed - Doctor-only flags and method / timing knobs from the typed CLI parse.
 * @param out - Env accumulator merged by {@link LocalEdgeStartupCli_applyParsedToEnv}.
 */
function LocalEdgeStartupCli_doctorEnv(
  parsed: LocalEdge_StartupCli_DoctorParsed,
  out: Record<string, string>,
): void {
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
function LocalEdgeStartupCli_ensureRunningEnv(
  parsed: LocalEdge_StartupCli_EnsureRunningParsed,
  out: Record<string, string>,
): void {
  if (parsed.methodSource === "primary") {
    out.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD_USE_PRIMARY = "1";
  } else {
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
function LocalEdgeStartupCli_initEnv(
  parsed: LocalEdge_StartupCli_InitParsed,
  out: Record<string, string>,
): void {
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
function LocalEdgeStartupCli_setupEnv(
  parsed: LocalEdge_StartupCli_SetupParsed,
  out: Record<string, string>,
): void {
  if (parsed.methodSource === "primary") {
    out.LOCAL_EDGE_STARTUP_CLI_SETUP_METHOD_USE_PRIMARY = "1";
  } else {
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
function LocalEdgeStartupCli_startEnv(
  parsed: LocalEdge_StartupCli_StartParsed,
  out: Record<string, string>,
): void {
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
function LocalEdgeStartupCli_stopEnv(
  parsed: LocalEdge_StartupCli_StopParsed,
  out: Record<string, string>,
): void {
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
export function LocalEdgeStartupCli_applyParsedToEnv(
  parsed: LocalEdge_StartupCli_Parsed,
): Record<string, string> {
  const out: Record<string, string> = {
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
      const exhaustive: never = parsed;
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
export function LocalEdgeStartupCli_applyResolvedMethodToEnv(
  resolved: LocalEdgeStartupCli_ResolvedMethod,
  out: Record<string, string>,
): void {
  out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD = resolved.method;
  out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_SOURCE = resolved.source;
  out.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_ALL_DEPRECATED =
    resolved.allDeprecationApplied ? "1" : "0";
}
/** Returns the implementation filename historically associated with a startup command. */
export function LocalEdgeStartupCli_resolveImplBaseName(
  command: LocalEdge_StartupCli_Command,
): string {
  const map: Record<LocalEdge_StartupCli_Command, string> = {
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
export function LocalEdgeStartupCli_renderUsage(options: {
  invocation: string;
}): string {
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
export function LocalEdgeStartupCli_buildImplSpawnPlan(options: {
  extraArgs?: readonly string[];
  implBaseName: string;
  implPath: string;
  parsed: LocalEdge_StartupCli_Parsed;
  env: Record<string, string | undefined>;
}): LocalEdgeStartupCli_ImplSpawnPlan {
  const envEntries = LocalEdgeStartupCli_applyParsedToEnv(options.parsed);

  const resolved = LocalEdgeStartupCli_resolveMethod({
    parsed: options.parsed,
    env: options.env,
  });
  let deprecationWarningLine: string | null = null;
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
