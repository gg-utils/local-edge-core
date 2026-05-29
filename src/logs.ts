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
export type LocalEdgeCore_LogsCliParseResult =
  | { readonly ok: true; readonly parsed: LocalEdgeCore_ParsedLogsCli }
  | {
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
export type LocalEdgeCore_LogsRunFileByIndexResolver = (
  indexOneBased: number,
) => string | undefined;

/** Options for resolving concrete files backing a parsed logs scope. */
export type LocalEdgeCore_ResolveLogsScopeFilesOptions = {
  readonly parsed: Pick<LocalEdgeCore_ParsedLogsCli, "scope" | "runIndex">;
  readonly pathLayout: LocalEdgeCore_LogsPathLayout;
  readonly fileExists: LocalEdgeCore_LogsFileExists;
  readonly resolveLatestRunLog: () => string | undefined;
  readonly resolveRunLogByIndex: LocalEdgeCore_LogsRunFileByIndexResolver;
};

/** Mutable parser state used internally before returning the readonly public shape. */
type LocalEdgeCore_MutableParsedLogsCli = {
  command: LocalEdgeCore_LogsCommandName;
  scope: LocalEdgeCore_LogsScopeName;
  runIndex: string;
  initialLines: string;
  initialChars: string;
  initialTokens: string;
  charsPerToken: string;
  hasCharsPerTokenOverride: boolean;
  timeoutSeconds: string;
};

/** Result of trying to consume one logs CLI option token. */
type LocalEdgeCore_LogsArgumentConsumeResult =
  | { readonly status: "consumed" }
  | { readonly status: "not_consumed" }
  | { readonly status: "terminal"; readonly result: LocalEdgeCore_LogsCliParseResult };

const LOCAL_EDGE_CORE_LOGS_LABEL = "local-edge:logs";
const LOCAL_EDGE_CORE_LOGS_POSITIVE_INT = /^[1-9][0-9]*$/;
const LOCAL_EDGE_CORE_LOGS_NUMERIC = /^[0-9]+(\.[0-9]+)?$/;

/** Renders the historical long-form logs CLI usage text. */
export function LocalEdgeCore_renderLogsUsage(): string {
  return `Usage:
  logs.ts tail [options]
  logs.ts history [options]
  logs.ts list-runs

Commands:
  tail       Follow logs.
  history    Print recent log history without following.
  list-runs  List recorded local-edge run logs.

Options:
  --scope <run|nginx-docker|healthcheck|all>
                  Log scope. Default: run.
  --run-index <N> Select Nth newest run log for history (scope=run/all only, default: 1).
  --lines <N>     Tail by lines (default selector).
  --chars <N>     Tail by chars.
  --tokens <N>    Tail by approximate tokens.
  --chars-per-token <N>
                  Conversion ratio for --tokens. Default: 4.
  --timeout-seconds <N>
                  For tail mode only; auto-stop after N seconds.
  --recent-only   Alias for history mode.
  --help          Show this help.

Examples:
  npm run local:edge:logs:tail
  npm run local:edge:logs:tail:all
  npm run local:edge:logs:recent
  npm run local:edge:logs:recent -- --run-index 2 --lines 1200`;
}

/** Formats an operator-visible info line with the logs CLI label. */
export function LocalEdgeCore_formatLogsInfoLine(message: string): string {
  return `[${LOCAL_EDGE_CORE_LOGS_LABEL}] ${message}`;
}

/** Formats an operator-visible error line with the logs CLI label. */
export function LocalEdgeCore_formatLogsErrorLine(message: string): string {
  return `[${LOCAL_EDGE_CORE_LOGS_LABEL}] ${message}`;
}

/** Parses a strictly positive integer env string with fallback. */
export function LocalEdgeCore_parseLogsEnvPositiveInt(
  raw: string | undefined,
  defaultValue: number,
): number {
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/** Parses a finite numeric env string with fallback. */
export function LocalEdgeCore_parseLogsEnvNumber(
  raw: string | undefined,
  defaultValue: number,
): number {
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** Normalizes leading argv so option-first invocations behave as `tail`. */
export function LocalEdgeCore_normalizeLogsArgv(
  argv: readonly string[],
): readonly string[] {
  if (argv.length === 0) {
    return [];
  }
  const first = argv[0];
  if (first === "tail" || first === "history" || first === "list-runs") {
    return argv;
  }
  return ["tail", ...argv];
}

/** True when `value` is a base-10 strictly positive integer string. */
export function LocalEdgeCore_isLogsPositiveIntString(value: string): boolean {
  return LOCAL_EDGE_CORE_LOGS_POSITIVE_INT.test(value);
}

/** True when `value` is a non-negative decimal numeric string accepted for chars-per-token. */
export function LocalEdgeCore_isLogsCharsPerTokenFormat(value: string): boolean {
  return LOCAL_EDGE_CORE_LOGS_NUMERIC.test(value);
}

/** Converts token counts into character budgets using the legacy ceiling rule. */
export function LocalEdgeCore_logsTokensToCharBudget(options: {
  readonly tokens: number;
  readonly charsPerToken: number;
}): number {
  let value = options.tokens * options.charsPerToken;
  if (value < 1) {
    value = 1;
  }
  const floored = Math.floor(value);
  return value === floored ? floored : floored + 1;
}

/** Coerces a raw scope token into a supported log scope or returns an error message. */
function LocalEdgeCore_parseLogsScopeOptionValue(
  value: string,
): LocalEdgeCore_LogsScopeName | { readonly error: string } {
  if (
    value === "run" ||
    value === "nginx-docker" ||
    value === "healthcheck" ||
    value === "all"
  ) {
    return value;
  }
  return { error: `Unsupported --scope value '${value}'.` };
}

/** Applies the optional leading command token, returning the option-only argv slice. */
function LocalEdgeCore_initializeLogsCommandFromArgv(
  argv: readonly string[],
  setCommand: (command: LocalEdgeCore_LogsCommandName) => void,
): readonly string[] {
  let rawCommand = argv[0] ?? "";
  if (rawCommand === "") {
    rawCommand = "tail";
  }

  if (rawCommand === "tail" || rawCommand === "history" || rawCommand === "list-runs") {
    setCommand(rawCommand);
    return argv.length > 0 ? argv.slice(1) : [];
  }

  setCommand("tail");
  return argv;
}

/** Builds a parse error result with consistent defaults. */
function LocalEdgeCore_logsCliError(options: {
  readonly message: string;
  readonly includeUsage?: boolean;
}): LocalEdgeCore_LogsCliParseResult {
  return {
    ok: false,
    kind: "error",
    message: options.message,
    includeUsage: options.includeUsage ?? false,
    exitCode: 1,
  };
}

/** Reads a separated `--flag value` pair from argv. */
function LocalEdgeCore_takeSeparatedLogsCliFlagValue(options: {
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly flagToken: string;
}): string | { readonly error: string } {
  const next = options.argv[options.cursor.i + 1];
  if (next === undefined || next.startsWith("-")) {
    return { error: `Missing value for ${options.flagToken}` };
  }
  options.cursor.i += 2;
  return next;
}

/** Applies line/char/token selector state to the mutable parse output. */
function LocalEdgeCore_applyLogsSelector(options: {
  readonly out: {
    initialLines: string;
    initialChars: string;
    initialTokens: string;
  };
  readonly selector: "lines" | "chars" | "tokens";
  readonly value: string;
}): void {
  options.out.initialLines = options.selector === "lines" ? options.value : "";
  options.out.initialChars = options.selector === "chars" ? options.value : "";
  options.out.initialTokens = options.selector === "tokens" ? options.value : "";
}

/** Builds the default mutable parser state from env-derived defaults. */
function LocalEdgeCore_createDefaultLogsCliState(
  options: LocalEdgeCore_ParseLogsCliOptions,
): LocalEdgeCore_MutableParsedLogsCli {
  return {
    command: "tail" as LocalEdgeCore_LogsCommandName,
    scope: "run" as LocalEdgeCore_LogsScopeName,
    runIndex: "1",
    initialLines: options.defaultLines,
    initialChars: "",
    initialTokens: "",
    charsPerToken: options.defaultCharsPerToken,
    hasCharsPerTokenOverride: false,
    timeoutSeconds: "",
  };
}

/** Consumes help tokens that short-circuit parser output. */
function LocalEdgeCore_tryConsumeLogsHelpArgument(
  argument: string,
): LocalEdgeCore_LogsArgumentConsumeResult {
  if (argument === "-h" || argument === "--help") {
    return {
      status: "terminal",
      result: { ok: false, kind: "help", includeUsage: true, exitCode: 0 },
    };
  }
  return { status: "not_consumed" };
}

/** Consumes `--scope` and `--run-index` separated and equals forms. */
function LocalEdgeCore_tryConsumeLogsScopeOrRunIndexArgument(options: {
  readonly argument: string;
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  if (options.argument === "--scope" || options.argument === "--run-index") {
    const value = LocalEdgeCore_takeSeparatedLogsCliFlagValue({
      argv: options.argv,
      cursor: options.cursor,
      flagToken: options.argument,
    });
    if (typeof value !== "string") {
      return {
        status: "terminal",
        result: LocalEdgeCore_logsCliError({ message: value.error }),
      };
    }
    if (options.argument === "--scope") {
      const scope = LocalEdgeCore_parseLogsScopeOptionValue(value);
      if (typeof scope !== "string") {
        return {
          status: "terminal",
          result: LocalEdgeCore_logsCliError({ message: scope.error }),
        };
      }
      options.out.scope = scope;
      return { status: "consumed" };
    }
    options.out.runIndex = value;
    return { status: "consumed" };
  }

  if (options.argument.startsWith("--scope=")) {
    const scope = LocalEdgeCore_parseLogsScopeOptionValue(
      options.argument.slice("--scope=".length),
    );
    if (typeof scope !== "string") {
      return {
        status: "terminal",
        result: LocalEdgeCore_logsCliError({ message: scope.error }),
      };
    }
    options.out.scope = scope;
    options.cursor.i += 1;
    return { status: "consumed" };
  }

  if (options.argument.startsWith("--run-index=")) {
    options.out.runIndex = options.argument.slice("--run-index=".length);
    options.cursor.i += 1;
    return { status: "consumed" };
  }

  return { status: "not_consumed" };
}

/** Resolves which selector flag, if any, is represented by `argument`. */
function LocalEdgeCore_logsSelectorForArgument(
  argument: string,
): "lines" | "chars" | "tokens" | null {
  if (argument === "--lines" || argument.startsWith("--lines=")) {
    return "lines";
  }
  if (argument === "--chars" || argument.startsWith("--chars=")) {
    return "chars";
  }
  if (argument === "--tokens" || argument.startsWith("--tokens=")) {
    return "tokens";
  }
  return null;
}

/** Consumes line/char/token selector flags. */
function LocalEdgeCore_tryConsumeLogsSelectorArgument(options: {
  readonly argument: string;
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  const selector = LocalEdgeCore_logsSelectorForArgument(options.argument);
  if (selector === null) {
    return { status: "not_consumed" };
  }

  const value = options.argument.includes("=")
    ? options.argument.slice(options.argument.indexOf("=") + 1)
    : LocalEdgeCore_takeSeparatedLogsCliFlagValue({
        argv: options.argv,
        cursor: options.cursor,
        flagToken: options.argument,
      });
  if (typeof value !== "string") {
    return {
      status: "terminal",
      result: LocalEdgeCore_logsCliError({ message: value.error }),
    };
  }
  LocalEdgeCore_applyLogsSelector({ out: options.out, selector, value });
  if (options.argument.includes("=")) {
    options.cursor.i += 1;
  }
  return { status: "consumed" };
}

/** Consumes `--chars-per-token` separated and equals forms. */
function LocalEdgeCore_tryConsumeLogsCharsPerTokenArgument(options: {
  readonly argument: string;
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  if (options.argument === "--chars-per-token") {
    const value = LocalEdgeCore_takeSeparatedLogsCliFlagValue({
      argv: options.argv,
      cursor: options.cursor,
      flagToken: options.argument,
    });
    if (typeof value !== "string") {
      return {
        status: "terminal",
        result: LocalEdgeCore_logsCliError({ message: value.error }),
      };
    }
    options.out.charsPerToken = value;
    options.out.hasCharsPerTokenOverride = true;
    return { status: "consumed" };
  }
  if (options.argument.startsWith("--chars-per-token=")) {
    options.out.charsPerToken = options.argument.slice("--chars-per-token=".length);
    options.out.hasCharsPerTokenOverride = true;
    options.cursor.i += 1;
    return { status: "consumed" };
  }
  return { status: "not_consumed" };
}

/** Consumes `--timeout-seconds` separated and equals forms. */
function LocalEdgeCore_tryConsumeLogsTimeoutArgument(options: {
  readonly argument: string;
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  if (options.argument === "--timeout-seconds") {
    const value = LocalEdgeCore_takeSeparatedLogsCliFlagValue({
      argv: options.argv,
      cursor: options.cursor,
      flagToken: options.argument,
    });
    if (typeof value !== "string") {
      return {
        status: "terminal",
        result: LocalEdgeCore_logsCliError({ message: value.error }),
      };
    }
    options.out.timeoutSeconds = value;
    return { status: "consumed" };
  }
  if (options.argument.startsWith("--timeout-seconds=")) {
    options.out.timeoutSeconds = options.argument.slice("--timeout-seconds=".length);
    options.cursor.i += 1;
    return { status: "consumed" };
  }
  return { status: "not_consumed" };
}

/** Consumes the `--recent-only` history alias. */
function LocalEdgeCore_tryConsumeLogsRecentOnlyArgument(options: {
  readonly argument: string;
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  if (options.argument !== "--recent-only") {
    return { status: "not_consumed" };
  }
  options.out.command = "history";
  options.cursor.i += 1;
  return { status: "consumed" };
}

/** Tries all known argument consumers in historical matching order. */
function LocalEdgeCore_consumeLogsArgument(options: {
  readonly argument: string;
  readonly argv: readonly string[];
  readonly cursor: { i: number };
  readonly out: LocalEdgeCore_MutableParsedLogsCli;
}): LocalEdgeCore_LogsArgumentConsumeResult {
  const consumers: Array<() => LocalEdgeCore_LogsArgumentConsumeResult> = [
    () => LocalEdgeCore_tryConsumeLogsHelpArgument(options.argument),
    () => LocalEdgeCore_tryConsumeLogsScopeOrRunIndexArgument(options),
    () => LocalEdgeCore_tryConsumeLogsSelectorArgument(options),
    () => LocalEdgeCore_tryConsumeLogsCharsPerTokenArgument(options),
    () => LocalEdgeCore_tryConsumeLogsTimeoutArgument(options),
    () => LocalEdgeCore_tryConsumeLogsRecentOnlyArgument(options),
  ];

  for (const consume of consumers) {
    const result = consume();
    if (result.status !== "not_consumed") {
      return result;
    }
  }
  return { status: "not_consumed" };
}

/** Parses logs CLI argv into normalized options or a help/error result. */
export function LocalEdgeCore_parseLogsCli(
  options: LocalEdgeCore_ParseLogsCliOptions,
): LocalEdgeCore_LogsCliParseResult {
  const out = LocalEdgeCore_createDefaultLogsCliState(options);

  const optionArgv = LocalEdgeCore_initializeLogsCommandFromArgv(options.argv, (command) => {
    out.command = command;
  });
  const cursor = { i: 0 };

  while (cursor.i < optionArgv.length) {
    const argument = optionArgv[cursor.i];
    if (argument === undefined) {
      break;
    }

    const result = LocalEdgeCore_consumeLogsArgument({
      argument,
      argv: optionArgv,
      cursor,
      out,
    });
    if (result.status === "terminal") {
      return result.result;
    }
    if (result.status === "consumed") {
      continue;
    }

    return LocalEdgeCore_logsCliError({
      message: `Unknown option: ${argument}`,
      includeUsage: true,
    });
  }

  return { ok: true, parsed: out };
}

/** Returns the first validation error for parsed logs CLI options, if any. */
export function LocalEdgeCore_validateParsedLogsCli(
  parsed: LocalEdgeCore_ParsedLogsCli,
): string | null {
  if (!LocalEdgeCore_isLogsPositiveIntString(parsed.runIndex)) {
    return "--run-index must be a positive integer.";
  }
  if (
    parsed.initialLines !== "" &&
    !LocalEdgeCore_isLogsPositiveIntString(parsed.initialLines)
  ) {
    return `Invalid --lines value '${parsed.initialLines}'.`;
  }
  if (
    parsed.initialChars !== "" &&
    !LocalEdgeCore_isLogsPositiveIntString(parsed.initialChars)
  ) {
    return `Invalid --chars value '${parsed.initialChars}'.`;
  }
  if (
    parsed.initialTokens !== "" &&
    !LocalEdgeCore_isLogsPositiveIntString(parsed.initialTokens)
  ) {
    return `Invalid --tokens value '${parsed.initialTokens}'.`;
  }
  if (!LocalEdgeCore_isLogsCharsPerTokenFormat(parsed.charsPerToken)) {
    return `Invalid --chars-per-token value '${parsed.charsPerToken}'.`;
  }
  if (parsed.hasCharsPerTokenOverride && parsed.initialTokens === "") {
    return "--chars-per-token requires --tokens selector.";
  }
  if (
    parsed.timeoutSeconds !== "" &&
    !LocalEdgeCore_isLogsPositiveIntString(parsed.timeoutSeconds)
  ) {
    return `Invalid --timeout-seconds value '${parsed.timeoutSeconds}'.`;
  }
  return null;
}

/** Translates parsed selectors into `tail` argv fragments honoring chars/tokens/lines priority. */
export function LocalEdgeCore_buildLogsFollowSelectorArgs(
  parsed: LocalEdgeCore_ParsedLogsCli,
): string[] {
  if (parsed.initialChars !== "") {
    return ["-c", parsed.initialChars];
  }
  if (parsed.initialTokens !== "") {
    return [
      "-c",
      String(
        LocalEdgeCore_logsTokensToCharBudget({
          tokens: Number.parseInt(parsed.initialTokens, 10),
          charsPerToken: Number(parsed.charsPerToken),
        }),
      ),
    ];
  }
  return ["-n", parsed.initialLines];
}

/** Builds blocking `tail` args for history output. */
export function LocalEdgeCore_buildLogsHistoryTailArgs(
  parsed: LocalEdgeCore_ParsedLogsCli,
  filePath: string,
): string[] {
  return [...LocalEdgeCore_buildLogsFollowSelectorArgs(parsed), filePath];
}

/** Builds standard local-edge logs path layout from an explicit project root. */
export function LocalEdgeCore_buildLogsPathLayout(projectRoot: string): LocalEdgeCore_LogsPathLayout {
  const localEdgeLogDir = `${projectRoot}/logs/local-edge`;
  const runLogDir = `${localEdgeLogDir}/runs`;
  return {
    localEdgeLogDir,
    runLogDir,
    runLogLatestLink: `${runLogDir}/latest.log`,
    runLogPattern: "local-edge-*.log",
  };
}

/** Resolves concrete log files for the parsed scope while adapters own file existence checks. */
export function LocalEdgeCore_resolveLogsScopeFiles(
  options: LocalEdgeCore_ResolveLogsScopeFilesOptions,
): string[] {
  const files: string[] = [];
  const runIndex = Number.parseInt(options.parsed.runIndex, 10);

  /** Appends candidate files only when the adapter confirms they are readable log files. */
  const appendIfFile = (filePath: string): void => {
    if (options.fileExists(filePath)) {
      files.push(filePath);
    }
  };

  /** Resolves the run log selected by the parsed one-based run index. */
  const resolveRunLog = (): string | undefined =>
    runIndex !== 1
      ? options.resolveRunLogByIndex(runIndex)
      : options.resolveLatestRunLog();

  if (options.parsed.scope === "run" || options.parsed.scope === "all") {
    const runFile = resolveRunLog();
    if (runFile !== undefined) {
      appendIfFile(runFile);
    }
  }

  if (options.parsed.scope === "nginx-docker" || options.parsed.scope === "all") {
    appendIfFile(`${options.pathLayout.localEdgeLogDir}/nginx-docker.log`);
  }

  if (options.parsed.scope === "healthcheck" || options.parsed.scope === "all") {
    appendIfFile(`${options.pathLayout.localEdgeLogDir}/healthcheck.log`);
  }

  return files;
}
