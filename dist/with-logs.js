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
import { LocalEdgeCore_logFormatterActiveValue, LocalEdgeCore_logFormatterEnabled, LocalEdgeCore_resolveLogOutputFormat, } from "./log-output.js";
/** Prefix for parent-process lines mirrored to run logs during shutdown/cleanup. */
export const LOCAL_EDGE_CORE_WITH_LOGS_SHUTDOWN_PREFIX = "[local-edge:shutdown] ";
/** CLI parse failure for with-logs subcommands. */
export class LocalEdgeCoreWithLogsCliError extends Error {
    /** Builds a named argv parse error. */
    constructor(message) {
        super(message);
        this.name = "LocalEdgeCoreWithLogsCliError";
    }
}
/** Renders the multi-line CLI usage synopsis for with-logs compatibility wrappers. */
export function LocalEdgeCore_withLogsRenderUsage() {
    return `Usage: with-logs.ts <command> [options]

Commands:
  resolve-formatter-state
      Prints TSV: <format>\\t<formatterEnabled>\\t<formatterActiveValue>

  print-prelude --log-file <path>
      Prints the standard with-logs prelude for the given log file path.

  print-shutdown-prefix
      Prints the shutdown parent line prefix (for bash to concatenate with message bodies).

  format-checkout-kind-error --project-root <path>
      One-line error when checkout kind resolution fails.

  format-reclaim-notice --project-root <path>
      One-line notice before reclaiming a stale local session.

  format-runtime-exit --exit-code <n>
      One-line shutdown message when the child runtime exits.
`;
}
/** Prepends the shutdown parent prefix to a message string. */
export function LocalEdgeCore_withLogsFormatShutdownParentLine(message) {
    return `${LOCAL_EDGE_CORE_WITH_LOGS_SHUTDOWN_PREFIX}${message}`;
}
/** Formats a checkout-kind resolution failure as a single error line. */
export function LocalEdgeCore_withLogsFormatCheckoutKindResolveFailed(projectRoot) {
    return `[local-edge] ERROR: Failed to resolve checkout kind for ${projectRoot}.`;
}
/** Formats a session-reclaim notice as a single informational log line. */
export function LocalEdgeCore_withLogsFormatReclaimNotice(projectRoot) {
    return `[local-edge] Reclaiming an older local session for ${projectRoot} before starting a new one.`;
}
/** Formats a runtime exit notice as a single shutdown-parent log line. */
export function LocalEdgeCore_withLogsFormatRuntimeExit(exitCode) {
    return LocalEdgeCore_withLogsFormatShutdownParentLine(`Runtime process exited with code ${String(exitCode)}.`);
}
/** Returns true only for stdout EPIPE errors that can be ignored during force-kill cleanup. */
export function LocalEdgeCore_withLogsIsIgnorableStdoutError(error) {
    return error instanceof Error && "code" in error && error.code === "EPIPE";
}
/** Maps a lifecycle event to the exact line written to the log / TTY. */
export function LocalEdgeCore_withLogsFormatLifecycleEvent(event) {
    switch (event.kind) {
        case "checkout_kind_resolve_failed":
            return LocalEdgeCore_withLogsFormatCheckoutKindResolveFailed(event.projectRoot);
        case "reclaim_session":
            return LocalEdgeCore_withLogsFormatReclaimNotice(event.projectRoot);
        case "runtime_exited":
            return LocalEdgeCore_withLogsFormatRuntimeExit(event.exitCode);
        case "shutdown_parent_message":
            return LocalEdgeCore_withLogsFormatShutdownParentLine(event.message);
        default: {
            const exhaustive = event;
            return exhaustive;
        }
    }
}
/** Resolves formatter state as `<format>\t<formatterEnabled>\t<formatterActiveValue>`. */
export function LocalEdgeCore_withLogsResolveFormatterStateTsv(env) {
    const format = LocalEdgeCore_resolveLogOutputFormat(env.LOCAL_EDGE_LOG_OUTPUT_FORMAT);
    const formatterEnabled = LocalEdgeCore_logFormatterEnabled(format);
    const formatterActive = LocalEdgeCore_logFormatterActiveValue(format);
    return [format, formatterEnabled ? "true" : "false", formatterActive].join("\t");
}
/** Ensures no trailing argv tokens remain for subcommands that accept no arguments. */
function LocalEdgeCore_withLogsExpectNoExtraArgs(commandLabel, rest) {
    if (rest.length > 0) {
        throw new LocalEdgeCoreWithLogsCliError(`Unexpected arguments for ${commandLabel}: ${rest.join(" ")}`);
    }
}
/** Parses a single `--flag value` pair from the argv remainder in order. */
function LocalEdgeCore_withLogsParseSingleRequiredFlag(options) {
    let value = "";
    for (let index = 0; index < options.rest.length; index += 1) {
        const token = options.rest[index];
        if (token === options.flag) {
            value = options.rest[index + 1] ?? "";
            index += 1;
            continue;
        }
        throw new LocalEdgeCoreWithLogsCliError(options.unknownTokenMessage(token));
    }
    if (value.length === 0) {
        throw new LocalEdgeCoreWithLogsCliError(options.missingMessage);
    }
    return value;
}
/** Parses required `--exit-code` for `format-runtime-exit` as a finite integer. */
function LocalEdgeCore_withLogsParseExitCodeFlag(rest) {
    const raw = LocalEdgeCore_withLogsParseSingleRequiredFlag({
        flag: "--exit-code",
        missingMessage: "format-runtime-exit requires --exit-code <integer>.",
        rest,
        unknownTokenMessage: (token) => `Unknown argument for format-runtime-exit: ${token}`,
    });
    const exitCode = Number.parseInt(raw, 10);
    if (!Number.isFinite(exitCode)) {
        throw new LocalEdgeCoreWithLogsCliError(`Invalid --exit-code: ${raw}`);
    }
    return exitCode;
}
/** Parses the with-logs argv slice into a discriminated command union. */
export function LocalEdgeCore_withLogsParseArgv(argv) {
    const [, , commandRaw, ...rest] = argv;
    const command = commandRaw ?? "";
    if (command.length === 0 || command === "--help" || command === "-h") {
        return { command: "help" };
    }
    if (command === "resolve-formatter-state") {
        LocalEdgeCore_withLogsExpectNoExtraArgs("resolve-formatter-state", rest);
        return { command: "resolve-formatter-state" };
    }
    if (command === "print-shutdown-prefix") {
        LocalEdgeCore_withLogsExpectNoExtraArgs("print-shutdown-prefix", rest);
        return { command: "print-shutdown-prefix" };
    }
    if (command === "print-prelude") {
        return {
            command: "print-prelude",
            logFile: LocalEdgeCore_withLogsParseSingleRequiredFlag({
                flag: "--log-file",
                missingMessage: "print-prelude requires --log-file <path>.",
                rest,
                unknownTokenMessage: (token) => `Unknown argument for print-prelude: ${token}`,
            }),
        };
    }
    if (command === "format-checkout-kind-error") {
        return {
            command: "format-checkout-kind-error",
            projectRoot: LocalEdgeCore_withLogsParseSingleRequiredFlag({
                flag: "--project-root",
                missingMessage: "format-checkout-kind-error requires --project-root <path>.",
                rest,
                unknownTokenMessage: (token) => `Unknown argument for format-checkout-kind-error: ${token}`,
            }),
        };
    }
    if (command === "format-reclaim-notice") {
        return {
            command: "format-reclaim-notice",
            projectRoot: LocalEdgeCore_withLogsParseSingleRequiredFlag({
                flag: "--project-root",
                missingMessage: "format-reclaim-notice requires --project-root <path>.",
                rest,
                unknownTokenMessage: (token) => `Unknown argument for format-reclaim-notice: ${token}`,
            }),
        };
    }
    if (command === "format-runtime-exit") {
        return {
            command: "format-runtime-exit",
            exitCode: LocalEdgeCore_withLogsParseExitCodeFlag(rest),
        };
    }
    throw new LocalEdgeCoreWithLogsCliError(`Unknown command: ${command}`);
}
//# sourceMappingURL=with-logs.js.map