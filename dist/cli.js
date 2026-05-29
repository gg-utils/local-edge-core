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
import { LocalEdgeCore_validateRequestedMethod } from "./method-config.js";
/** Parses the package-core CLI shell flags without executing host mutations. */
export function LocalEdgeCore_parseCliArgs(args) {
    const result = {
        dryRun: false,
        format: "text",
        manifestPath: null,
        help: false,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--dry-run") {
            result.dryRun = true;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            result.help = true;
            continue;
        }
        if (arg === "--format") {
            const value = args[index + 1];
            if (value !== "text" && value !== "json") {
                throw new Error("local-edge-core-cli-invalid-format");
            }
            result.format = value;
            index += 1;
            continue;
        }
        if (arg === "--manifest") {
            const value = args[index + 1];
            if (!value) {
                throw new Error("local-edge-core-cli-missing-manifest");
            }
            result.manifestPath = value;
            index += 1;
        }
    }
    return result;
}
/** Parses render command argv without loading env or writing artifacts. */
export function LocalEdgeCore_parseRenderCliArgs(options) {
    let requestedMethod = options.defaultMethod;
    let mode = "execute";
    for (let index = 0; index < options.args.length; index += 1) {
        const argument = options.args[index];
        if (argument === "--method") {
            requestedMethod = options.args[index + 1] ?? "";
            index += 1;
        }
        else if (argument === "--dry-run" || argument === "--check") {
            mode = "check";
        }
        else {
            throw new Error(`[${options.commandLabel}] Unknown option: ${argument}`);
        }
    }
    return {
        method: LocalEdgeCore_validateRequestedMethod({
            allowAll: true,
            commandLabel: options.commandLabel,
            method: requestedMethod,
            supportedMethods: options.supportedMethods,
        }),
        mode,
    };
}
/** Renders deterministic help, text, or JSON output for the current CLI shell. */
export function LocalEdgeCore_renderCliOutput(options) {
    if (options.help) {
        return [
            "local-edge core",
            "",
            "Usage: local-edge --manifest <path> [--dry-run] [--format text|json]",
        ].join("\n");
    }
    const payload = {
        command: "local-edge-core-cli-dry-run-plan",
        dryRun: options.dryRun,
        manifestPath: options.manifestPath,
    };
    if (options.format === "json") {
        return JSON.stringify(payload, null, 2);
    }
    const manifestLabel = options.manifestPath ?? "<none>";
    return `[local-edge-core] dryRun=${String(options.dryRun)} manifest=${manifestLabel}`;
}
/** Runs the package-core CLI shell and returns a process-style exit code. */
export function LocalEdgeCore_runCli(args) {
    try {
        const parsed = LocalEdgeCore_parseCliArgs(args);
        console.log(LocalEdgeCore_renderCliOutput(parsed));
        return 0;
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "local-edge-core-cli-unknown-error";
        console.error(`[local-edge-core:error] ${message}`);
        return 1;
    }
}
//# sourceMappingURL=cli.js.map