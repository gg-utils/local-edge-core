/**
 * @fileoverview Verifies `local-edge-core` interactive prompt helpers for yes/no confirmation and
 * Homebrew formula install flows.
 *
 * This file owns regression coverage for `LocalEdgeCore_yesNo` and
 * `LocalEdgeCore_installHomebrewFormula`, including TTY vs non-interactive defaults, prompt
 * formatting, answer parsing, and captured `brew install` invocations from injected dependencies.
 * Flow: build fake prompt dependencies with queued answers -> assert returned booleans, emitted
 * prompt strings, and recorded commands match the contracts in `prompt.ts`.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/prompt.unit.test.ts
 *
 * @see packages/local-edge-core/src/prompt.ts - Product-neutral yes/no and Homebrew install prompt implementation whose TTY, parsing, and command-dispatch behavior is asserted here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract this header follows for verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_installHomebrewFormula,
  LocalEdgeCore_yesNo,
  type LocalEdgeCore_HomebrewPromptDependencies,
  type LocalEdgeCore_YesNoPromptDependencies,
} from "./prompt.js";

/** Creates deterministic prompt dependencies with queued answers. */
function createPromptDependencies(options: {
  readonly stdinIsTty: boolean;
  readonly answers?: readonly string[];
}): {
  readonly dependencies: LocalEdgeCore_YesNoPromptDependencies;
  readonly prompts: string[];
} {
  const prompts: string[] = [];
  const answers = [...(options.answers ?? [])];

  return {
    dependencies: {
      stdinIsTty: options.stdinIsTty,
      /** Records the full prompt and returns the next queued answer. */
      async askQuestion(prompt: string): Promise<string> {
        prompts.push(prompt);
        return answers.shift() ?? "";
      },
    },
    prompts,
  };
}

/** Creates deterministic Homebrew prompt dependencies with captured command invocations. */
function createHomebrewDependencies(options: {
  readonly stdinIsTty: boolean;
  readonly answers?: readonly string[];
  readonly commandStatus?: number | null;
}): {
  readonly dependencies: LocalEdgeCore_HomebrewPromptDependencies;
  readonly prompts: string[];
  readonly commands: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly timeoutMs: number;
  }>;
} {
  const { dependencies, prompts } = createPromptDependencies(options);
  const commands: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly timeoutMs: number;
  }> = [];

  return {
    dependencies: {
      ...dependencies,
      /** Records install commands instead of mutating the host. */
      runCommand(command: string, args: readonly string[], timeoutMs: number): { status: number | null } {
        commands.push({ command, args, timeoutMs });
        return { status: options.commandStatus ?? 0 };
      },
    },
    prompts,
    commands,
  };
}

test("LocalEdgeCore_yesNo returns the default answer in non-interactive mode", async () => {
  assert.equal(
    await LocalEdgeCore_yesNo({
      prompt: "Continue?",
      defaultAnswer: "y",
      dependencies: createPromptDependencies({ stdinIsTty: false }).dependencies,
    }),
    true,
  );

  assert.equal(
    await LocalEdgeCore_yesNo({
      prompt: "Continue?",
      defaultAnswer: "n",
      dependencies: createPromptDependencies({ stdinIsTty: false }).dependencies,
    }),
    false,
  );
});

test("LocalEdgeCore_yesNo formats hints and parses accepted answers", async () => {
  const { dependencies, prompts } = createPromptDependencies({
    stdinIsTty: true,
    answers: [" yes "],
  });

  assert.equal(
    await LocalEdgeCore_yesNo({
      prompt: "Continue?",
      defaultAnswer: "n",
      dependencies,
    }),
    true,
  );
  assert.deepEqual(prompts, ["Continue? [y/N] "]);
});

test("LocalEdgeCore_yesNo uses the default answer for blank interactive input", async () => {
  const { dependencies } = createPromptDependencies({
    stdinIsTty: true,
    answers: [""],
  });

  assert.equal(
    await LocalEdgeCore_yesNo({
      prompt: "Continue?",
      defaultAnswer: "y",
      dependencies,
    }),
    true,
  );
});

test("LocalEdgeCore_installHomebrewFormula skips install when the prompt is rejected", async () => {
  const { dependencies, commands, prompts } = createHomebrewDependencies({
    stdinIsTty: true,
    answers: ["n"],
  });

  assert.equal(
    await LocalEdgeCore_installHomebrewFormula({
      formula: "mkcert",
      purpose: "TLS generation",
      dependencies,
    }),
    false,
  );
  assert.deepEqual(prompts, ["Install mkcert via Homebrew (TLS generation)? [Y/n] "]);
  assert.deepEqual(commands, []);
});

test("LocalEdgeCore_installHomebrewFormula returns true when brew install succeeds", async () => {
  const { dependencies, commands } = createHomebrewDependencies({
    stdinIsTty: true,
    answers: ["y"],
    commandStatus: 0,
  });

  assert.equal(
    await LocalEdgeCore_installHomebrewFormula({
      formula: "dnsmasq",
      purpose: "split DNS",
      dependencies,
    }),
    true,
  );
  assert.deepEqual(commands, [
    {
      command: "brew",
      args: ["install", "dnsmasq"],
      timeoutMs: 120_000,
    },
  ]);
});

test("LocalEdgeCore_installHomebrewFormula returns false when brew install fails", async () => {
  const { dependencies } = createHomebrewDependencies({
    stdinIsTty: true,
    answers: ["y"],
    commandStatus: 1,
  });

  assert.equal(
    await LocalEdgeCore_installHomebrewFormula({
      formula: "dnsmasq",
      purpose: "split DNS",
      dependencies,
    }),
    false,
  );
});
