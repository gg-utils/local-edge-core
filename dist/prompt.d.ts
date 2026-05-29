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
/** Valid default answer tokens for yes/no prompts. */
export type LocalEdgeCore_YesNoDefaultAnswer = "y" | "n";
/** Dependencies for prompt tests and non-standard terminal adapters. */
export type LocalEdgeCore_YesNoPromptDependencies = {
    readonly stdinIsTty: boolean;
    readonly askQuestion: (prompt: string) => Promise<string>;
};
/** Command result shape used by Homebrew install prompts. */
export type LocalEdgeCore_PromptCommandResult = {
    readonly status: number | null;
};
/** Dependencies for Homebrew install prompt tests and adapter-specific process wrappers. */
export type LocalEdgeCore_HomebrewPromptDependencies = LocalEdgeCore_YesNoPromptDependencies & {
    readonly runCommand: (command: string, args: readonly string[], timeoutMs: number) => LocalEdgeCore_PromptCommandResult;
};
/** Options for {@link LocalEdgeCore_yesNo}. */
export type LocalEdgeCore_YesNoOptions = {
    readonly prompt: string;
    readonly defaultAnswer?: LocalEdgeCore_YesNoDefaultAnswer;
    readonly dependencies?: LocalEdgeCore_YesNoPromptDependencies;
};
/** Options for {@link LocalEdgeCore_installHomebrewFormula}. */
export type LocalEdgeCore_InstallHomebrewFormulaOptions = {
    readonly formula: string;
    readonly purpose: string;
    readonly dependencies?: LocalEdgeCore_HomebrewPromptDependencies;
};
/**
 * Prompts the user for a yes/no answer on stdin.
 *
 * @remarks
 * Non-interactive environments return the default answer without prompting, preserving the legacy
 * shell helper behavior used by automated setup checks.
 */
export declare function LocalEdgeCore_yesNo(options: LocalEdgeCore_YesNoOptions): Promise<boolean>;
/**
 * Prompts to install a Homebrew formula and runs `brew install <formula>` when accepted.
 *
 * @remarks
 * The helper is intentionally explicit and host-mutating only after the yes/no prompt accepts.
 */
export declare function LocalEdgeCore_installHomebrewFormula(options: LocalEdgeCore_InstallHomebrewFormulaOptions): Promise<boolean>;
//# sourceMappingURL=prompt.d.ts.map