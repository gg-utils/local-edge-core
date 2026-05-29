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
export type LocalEdgeCore_ShellShimParseResult =
  | {
      readonly command: "print-prelude";
      readonly logFile: string;
    }
  | {
      readonly command: "resolve-formatter-state";
    }
  | {
      readonly command: "is-truthy";
      readonly value: string;
    }
  | {
      readonly command: "collect-active-env-files";
      readonly projectRoot: string;
    }
  | {
      readonly command: "normalize-legacy-artifact-path";
      readonly machineRoot: string;
      readonly rawPath: string;
    }
  | {
      readonly command: "print-method-url-matrix";
      readonly method: string;
    }
  | {
      readonly command: "resolve-log-color-enabled";
      readonly isTtyStdout: boolean;
    }
  | {
      readonly command: "help";
    };

/** Argv parsing failure for shell-shim command contracts. */
export class LocalEdgeCoreShellShimError extends Error {
  /** Builds an error tagged for shell-shim parser failures. */
  constructor(message: string) {
    super(message);
    this.name = "LocalEdgeCoreShellShimError";
  }
}

/** Renders the shim `--help` text listing subcommands and flag shapes consumed by shell wrappers. */
export function LocalEdgeCore_renderShellShimUsage(): string {
  return `Usage: lib-shell-shim.ts <command> [options]

Commands:
  resolve-formatter-state
      Reads process.env and prints a single TSV line:
      <format>\\t<formatterEnabled>\\t<formatterActiveValue>

  print-prelude --log-file <path>
      Prints the standard with-logs prelude for the given log file path.

  is-truthy <value>
      Prints "true" or "false" for bash [[ ... ]] comparisons.

  collect-active-env-files --project-root <path>
      Prints one env file path per line (ordered, de-duplicated).

  normalize-legacy-artifact-path --machine-root <path> --raw <path>
      Prints the normalized artifact path (may be empty line for empty raw).

  print-method-url-matrix --method <nginx-docker>
      Prints the URL matrix lines for the method using process.env.

  resolve-log-color-enabled --is-tty-stdout <true|false>
      Prints "true" or "false" using LOCAL_EDGE_LOG_FORMATTER_ACTIVE, NO_COLOR, LOCAL_EDGE_COLOR.
`;
}

/** Parses argv tail for `resolve-formatter-state`, accepting no trailing tokens. */
function LocalEdgeCore_parseShellShimResolveFormatterState(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  if (rest.length > 0) {
    throw new LocalEdgeCoreShellShimError(
      `Unexpected arguments for resolve-formatter-state: ${rest.join(" ")}`,
    );
  }
  return { command: "resolve-formatter-state" };
}

/** Parses argv tail for `print-prelude`, requiring `--log-file` with a non-empty path. */
function LocalEdgeCore_parseShellShimPrintPrelude(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  let logFile = "";
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--log-file") {
      logFile = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new LocalEdgeCoreShellShimError(
      `Unknown argument for print-prelude: ${token}`,
    );
  }
  if (logFile.length === 0) {
    throw new LocalEdgeCoreShellShimError(
      "print-prelude requires --log-file <path>.",
    );
  }
  return { command: "print-prelude", logFile };
}

/** Parses argv tail for `is-truthy`, accepting zero or one positional value. */
function LocalEdgeCore_parseShellShimIsTruthy(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  const value = rest[0] ?? "false";
  if (rest.length > 1) {
    throw new LocalEdgeCoreShellShimError(
      `Unexpected arguments for is-truthy: ${rest.slice(1).join(" ")}`,
    );
  }
  return { command: "is-truthy", value };
}

/** Parses argv tail for `collect-active-env-files`, requiring `--project-root`. */
function LocalEdgeCore_parseShellShimCollectActiveEnvFiles(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  let projectRoot = "";
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--project-root") {
      projectRoot = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new LocalEdgeCoreShellShimError(
      `Unknown argument for collect-active-env-files: ${token}`,
    );
  }
  if (projectRoot.length === 0) {
    throw new LocalEdgeCoreShellShimError(
      "collect-active-env-files requires --project-root <path>.",
    );
  }
  return { command: "collect-active-env-files", projectRoot };
}

/** Parses argv tail for `normalize-legacy-artifact-path`, requiring both path flags. */
function LocalEdgeCore_parseShellShimNormalizeLegacyArtifactPath(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  let machineRoot = "";
  let rawPath = "";
  let sawMachineRoot = false;
  let sawRaw = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--machine-root") {
      machineRoot = rest[index + 1] ?? "";
      sawMachineRoot = true;
      index += 1;
      continue;
    }
    if (token === "--raw") {
      rawPath = rest[index + 1] ?? "";
      sawRaw = true;
      index += 1;
      continue;
    }
    throw new LocalEdgeCoreShellShimError(
      `Unknown argument for normalize-legacy-artifact-path: ${token}`,
    );
  }
  if (!sawMachineRoot || !sawRaw || machineRoot.length === 0) {
    throw new LocalEdgeCoreShellShimError(
      "normalize-legacy-artifact-path requires --machine-root <path> --raw <path>.",
    );
  }
  return { command: "normalize-legacy-artifact-path", machineRoot, rawPath };
}

/** Parses argv tail for `print-method-url-matrix`, requiring `--method`. */
function LocalEdgeCore_parseShellShimPrintMethodUrlMatrix(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  let method = "";
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--method") {
      method = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new LocalEdgeCoreShellShimError(
      `Unknown argument for print-method-url-matrix: ${token}`,
    );
  }
  if (method.length === 0) {
    throw new LocalEdgeCoreShellShimError(
      "print-method-url-matrix requires --method <name>.",
    );
  }
  return { command: "print-method-url-matrix", method };
}

/** Parses argv tail for `resolve-log-color-enabled`, requiring a literal boolean TTY flag. */
function LocalEdgeCore_parseShellShimResolveLogColorEnabled(
  rest: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  let isTtyStdout: boolean | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--is-tty-stdout") {
      const raw = rest[index + 1] ?? "";
      index += 1;
      if (raw === "true") {
        isTtyStdout = true;
      } else if (raw === "false") {
        isTtyStdout = false;
      } else {
        throw new LocalEdgeCoreShellShimError(
          `resolve-log-color-enabled requires --is-tty-stdout true|false (got '${raw}').`,
        );
      }
      continue;
    }
    throw new LocalEdgeCoreShellShimError(
      `Unknown argument for resolve-log-color-enabled: ${token}`,
    );
  }
  if (isTtyStdout === undefined) {
    throw new LocalEdgeCoreShellShimError(
      "resolve-log-color-enabled requires --is-tty-stdout <true|false>.",
    );
  }
  return { command: "resolve-log-color-enabled", isTtyStdout };
}

/** Parses command argv where argv[0] is the shell-shim subcommand token. */
export function LocalEdgeCore_parseShellShimArgv(
  argv: readonly string[],
): LocalEdgeCore_ShellShimParseResult {
  const [commandRaw, ...rest] = argv;
  const command = commandRaw ?? "";

  if (command.length === 0 || command === "--help" || command === "-h") {
    return { command: "help" };
  }

  if (command === "resolve-formatter-state") {
    return LocalEdgeCore_parseShellShimResolveFormatterState(rest);
  }
  if (command === "print-prelude") {
    return LocalEdgeCore_parseShellShimPrintPrelude(rest);
  }
  if (command === "is-truthy") {
    return LocalEdgeCore_parseShellShimIsTruthy(rest);
  }
  if (command === "collect-active-env-files") {
    return LocalEdgeCore_parseShellShimCollectActiveEnvFiles(rest);
  }
  if (command === "normalize-legacy-artifact-path") {
    return LocalEdgeCore_parseShellShimNormalizeLegacyArtifactPath(rest);
  }
  if (command === "print-method-url-matrix") {
    return LocalEdgeCore_parseShellShimPrintMethodUrlMatrix(rest);
  }
  if (command === "resolve-log-color-enabled") {
    return LocalEdgeCore_parseShellShimResolveLogColorEnabled(rest);
  }

  throw new LocalEdgeCoreShellShimError(`Unknown command: ${command}`);
}
