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

/** ANSI escape codes matching the legacy local-edge shell formatter. */
const LOCAL_EDGE_CORE_ANSI_RESET = "\x1b[0m";
const LOCAL_EDGE_CORE_ANSI_BOLD_CYAN = "\x1b[1;36m";
const LOCAL_EDGE_CORE_ANSI_BOLD_GREEN = "\x1b[1;32m";
const LOCAL_EDGE_CORE_ANSI_GREEN = "\x1b[32m";
const LOCAL_EDGE_CORE_ANSI_BOLD_YELLOW = "\x1b[1;33m";
const LOCAL_EDGE_CORE_ANSI_YELLOW = "\x1b[33m";
const LOCAL_EDGE_CORE_ANSI_BOLD_RED = "\x1b[1;31m";
const LOCAL_EDGE_CORE_ANSI_RED = "\x1b[31m";

/** Shared options accepted by core local-edge log functions. */
export type LocalEdgeCore_LogOptions = {
  colorEnabled: boolean;
};

/** Callback type for injectable logging. */
export type LocalEdgeCore_LogFn = (message: string) => void;

/** Whether a string token should be treated as truthy by local-edge compatibility wrappers. */
export function LocalEdgeCore_isTruthy(value: string | undefined): boolean {
  const normalized = value ?? "false";
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "TRUE" ||
    normalized === "yes" ||
    normalized === "YES"
  );
}

/** Resolves the normalized log output format from caller-provided raw text. */
export function LocalEdgeCore_resolveLogOutputFormat(
  rawValue: string | undefined,
): LocalEdgeCore_LogOutputFormat {
  return rawValue === "raw" ? "raw" : "formatted";
}

/** Returns whether a normalized log output format enables the formatter pipeline. */
export function LocalEdgeCore_logFormatterEnabled(
  format: LocalEdgeCore_LogOutputFormat,
): boolean {
  return format === "formatted";
}

/** Returns the string flag exported for formatter-aware child processes. */
export function LocalEdgeCore_logFormatterActiveValue(
  format: LocalEdgeCore_LogOutputFormat,
): "true" | "false" {
  return LocalEdgeCore_logFormatterEnabled(format) ? "true" : "false";
}

/** Computes whether ANSI color should be emitted for log prefixes. */
export function LocalEdgeCore_logColorEnabled(options: {
  formatterActive: boolean;
  noColor: string | undefined;
  colorMode: string | undefined;
  isTtyStdout: boolean;
}): boolean {
  if (options.formatterActive) {
    return false;
  }

  if (options.noColor !== undefined && options.noColor !== "") {
    return false;
  }

  const requested = (options.colorMode ?? "auto").toLowerCase();
  if (
    requested === "1" ||
    requested === "true" ||
    requested === "yes" ||
    requested === "always"
  ) {
    return true;
  }
  if (
    requested === "0" ||
    requested === "false" ||
    requested === "no" ||
    requested === "never"
  ) {
    return false;
  }

  return options.isTtyStdout;
}

/** Builds the standard local-edge log prelude from explicit command labels. */
export function LocalEdgeCore_buildWithLogsPrelude(options: {
  logFile: string;
  tailRunLogsCommand: string;
  tailAllLogsCommand: string;
  recentRunLogCommand: string;
  runLogHistoryCommand: string;
  sectionLabel: string;
}): string {
  const lines = [
    `[local-edge] Logging to ${options.logFile}`,
    `[local-edge] Tail run logs: ${options.tailRunLogsCommand}`,
    `[local-edge] Tail all logs: ${options.tailAllLogsCommand}`,
    `[local-edge] Recent run log: ${options.recentRunLogCommand}`,
    `[local-edge] Run log history: ${options.runLogHistoryCommand}`,
    `[local-edge:section] ${options.sectionLabel}`,
  ];

  return `${lines.join("\n")}\n`;
}

/** Prints `[local-edge] <message>` to stdout. */
export function LocalEdgeCore_logInfo(
  message: string,
  options: LocalEdgeCore_LogOptions,
): void {
  if (options.colorEnabled) {
    process.stdout.write(
      `${LOCAL_EDGE_CORE_ANSI_BOLD_CYAN}[local-edge]${LOCAL_EDGE_CORE_ANSI_RESET} ${message}\n`,
    );
    return;
  }
  process.stdout.write(`[local-edge] ${message}\n`);
}

/** Prints `[local-edge] OK: <message>` to stdout. */
export function LocalEdgeCore_logSuccess(
  message: string,
  options: LocalEdgeCore_LogOptions,
): void {
  if (options.colorEnabled) {
    process.stdout.write(
      `${LOCAL_EDGE_CORE_ANSI_BOLD_GREEN}[local-edge]${LOCAL_EDGE_CORE_ANSI_RESET} ${LOCAL_EDGE_CORE_ANSI_GREEN}OK:${LOCAL_EDGE_CORE_ANSI_RESET} ${message}\n`,
    );
    return;
  }
  process.stdout.write(`[local-edge] OK: ${message}\n`);
}

/** Prints `[local-edge] WARNING: <message>` to stderr. */
export function LocalEdgeCore_logWarn(
  message: string,
  options: LocalEdgeCore_LogOptions,
): void {
  if (options.colorEnabled) {
    process.stderr.write(
      `${LOCAL_EDGE_CORE_ANSI_BOLD_YELLOW}[local-edge]${LOCAL_EDGE_CORE_ANSI_RESET} ${LOCAL_EDGE_CORE_ANSI_YELLOW}WARNING:${LOCAL_EDGE_CORE_ANSI_RESET} ${message}\n`,
    );
    return;
  }
  process.stderr.write(`[local-edge] WARNING: ${message}\n`);
}

/** Prints `[local-edge] ERROR: <message>` to stderr. */
export function LocalEdgeCore_logError(
  message: string,
  options: LocalEdgeCore_LogOptions,
): void {
  if (options.colorEnabled) {
    process.stderr.write(
      `${LOCAL_EDGE_CORE_ANSI_BOLD_RED}[local-edge]${LOCAL_EDGE_CORE_ANSI_RESET} ${LOCAL_EDGE_CORE_ANSI_RED}ERROR:${LOCAL_EDGE_CORE_ANSI_RESET} ${message}\n`,
    );
    return;
  }
  process.stderr.write(`[local-edge] ERROR: ${message}\n`);
}

/** Prints a section header, optionally using the formatter marker contract. */
export function LocalEdgeCore_logSection(
  title: string,
  options: LocalEdgeCore_LogOptions & { formatterActive: boolean },
): void {
  if (options.formatterActive) {
    process.stdout.write(`[local-edge:section] ${title}\n`);
    return;
  }

  const divider =
    "==============================================================================";
  LocalEdgeCore_logInfo(divider, options);
  LocalEdgeCore_logInfo(title, options);
  LocalEdgeCore_logInfo(divider, options);
}
