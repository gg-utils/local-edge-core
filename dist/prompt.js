/**
 * @fileoverview Product-neutral interactive prompt helpers for local-edge setup flows.
 *
 * This file owns reusable yes/no prompt parsing and explicit Homebrew formula installation command
 * dispatch via `brew install` after an interactive accept. Adapters decide which formulas are needed,
 * why they are needed, and whether a host-mutating install prompt is appropriate for the current command mode.
 * Flow: resolve TTY-aware dependencies -> prompt (or default in CI) -> optional `brew install` with inherited stdio.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/prompt.unit.test.ts
 *
 * @see scripts/local-edge/lib-prompt.ts - Script-layer re-export facade that preserves legacy `./lib-prompt` import paths while delegating yes/no and Homebrew install behavior to this module.
 * @see packages/local-edge-core/src/prompt.unit.test.ts - Jest regression coverage for non-interactive defaults, interactive parsing, and mocked `brew install` outcomes owned by this module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository contract defining the audited file-overview tag order and `@documentation` metadata used by this header.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
/** Prompts on stderr through Node readline and resolves the raw answer text. */
function LocalEdgeCore_readlineQuestion(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stderr,
        });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
/** Runs a host command for prompt-confirmed installation flows. */
function LocalEdgeCore_runPromptCommand(command, args, timeoutMs) {
    const result = spawnSync(command, [...args], {
        stdio: "inherit",
        timeout: timeoutMs,
    });
    return { status: result.status };
}
/** Resolves default prompt dependencies at call time so TTY state is not captured at import time. */
function LocalEdgeCore_resolveYesNoDependencies(dependencies) {
    return (dependencies ?? {
        stdinIsTty: Boolean(process.stdin.isTTY),
        askQuestion: LocalEdgeCore_readlineQuestion,
    });
}
/** Resolves default Homebrew install dependencies. */
function LocalEdgeCore_resolveHomebrewDependencies(dependencies) {
    return (dependencies ?? {
        stdinIsTty: Boolean(process.stdin.isTTY),
        askQuestion: LocalEdgeCore_readlineQuestion,
        runCommand: LocalEdgeCore_runPromptCommand,
    });
}
/** Converts a default answer token into the legacy prompt hint. */
function LocalEdgeCore_formatYesNoHint(defaultAnswer) {
    return defaultAnswer === "y" ? "[Y/n]" : "[y/N]";
}
/**
 * Prompts the user for a yes/no answer on stdin.
 *
 * @remarks
 * Non-interactive environments return the default answer without prompting, preserving the legacy
 * shell helper behavior used by automated setup checks.
 */
export async function LocalEdgeCore_yesNo(options) {
    const defaultAnswer = options.defaultAnswer ?? "n";
    const dependencies = LocalEdgeCore_resolveYesNoDependencies(options.dependencies);
    if (!dependencies.stdinIsTty) {
        return defaultAnswer === "y";
    }
    const fullPrompt = `${options.prompt} ${LocalEdgeCore_formatYesNoHint(defaultAnswer)} `;
    const answer = await dependencies.askQuestion(fullPrompt);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed.length === 0) {
        return defaultAnswer === "y";
    }
    return trimmed === "y" || trimmed === "yes";
}
/**
 * Prompts to install a Homebrew formula and runs `brew install <formula>` when accepted.
 *
 * @remarks
 * The helper is intentionally explicit and host-mutating only after the yes/no prompt accepts.
 */
export async function LocalEdgeCore_installHomebrewFormula(options) {
    const dependencies = LocalEdgeCore_resolveHomebrewDependencies(options.dependencies);
    const accepted = await LocalEdgeCore_yesNo({
        prompt: `Install ${options.formula} via Homebrew (${options.purpose})?`,
        defaultAnswer: "y",
        dependencies,
    });
    if (!accepted) {
        return false;
    }
    const result = dependencies.runCommand("brew", ["install", options.formula], 120_000);
    return result.status === 0;
}
//# sourceMappingURL=prompt.js.map