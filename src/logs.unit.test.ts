/**
 * @fileoverview Verifies `local-edge-core` logs CLI parsing, tail/history selector math, usage
 * rendering, path layout, and scope-aware log file resolution helpers.
 *
 * This file owns regression coverage for `LocalEdgeCore_parseLogsCli`,
 * `LocalEdgeCore_validateParsedLogsCli`, follow/history argv builders, env parsers, formatting
 * helpers, and `LocalEdgeCore_resolveLogsScopeFiles` wiring used by adapter-owned logs commands.
 * Flow: build argv or parsed shapes -> assert parse results, validation messages, derived argv
 * slices, and resolved file lists against the contracts in `logs.js`.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/logs.unit.test.ts
 *
 * @see packages/local-edge-core/src/logs.ts - Runtime logs CLI parsing, token/char budgeting, path layout, and scope resolution surface asserted by this module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract this header follows for verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildLogsFollowSelectorArgs,
  LocalEdgeCore_buildLogsHistoryTailArgs,
  LocalEdgeCore_buildLogsPathLayout,
  LocalEdgeCore_formatLogsErrorLine,
  LocalEdgeCore_formatLogsInfoLine,
  LocalEdgeCore_logsTokensToCharBudget,
  LocalEdgeCore_normalizeLogsArgv,
  LocalEdgeCore_parseLogsCli,
  LocalEdgeCore_parseLogsEnvNumber,
  LocalEdgeCore_parseLogsEnvPositiveInt,
  LocalEdgeCore_renderLogsUsage,
  LocalEdgeCore_resolveLogsScopeFiles,
  LocalEdgeCore_validateParsedLogsCli,
} from "./logs.js";

test("LocalEdgeCore_parseLogsCli defaults to tail run logs", () => {
  const result = LocalEdgeCore_parseLogsCli({
    argv: [],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.parsed, {
      command: "tail",
      scope: "run",
      runIndex: "1",
      initialLines: "1000",
      initialChars: "",
      initialTokens: "",
      charsPerToken: "4",
      hasCharsPerTokenOverride: false,
      timeoutSeconds: "",
    });
  }
});

test("LocalEdgeCore_parseLogsCli parses history all token selectors", () => {
  const result = LocalEdgeCore_parseLogsCli({
    argv: [
      "history",
      "--scope=all",
      "--run-index",
      "2",
      "--tokens=10",
      "--chars-per-token",
      "3.5",
    ],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.parsed.command, "history");
    assert.equal(result.parsed.scope, "all");
    assert.equal(result.parsed.runIndex, "2");
    assert.equal(result.parsed.initialTokens, "10");
    assert.equal(result.parsed.charsPerToken, "3.5");
    assert.equal(result.parsed.hasCharsPerTokenOverride, true);
  }
});

test("LocalEdgeCore_parseLogsCli supports recent-only as history alias", () => {
  const result = LocalEdgeCore_parseLogsCli({
    argv: ["tail", "--recent-only", "--lines", "5"],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.parsed.command, "history");
    assert.equal(result.parsed.initialLines, "5");
  }
});

test("LocalEdgeCore_parseLogsCli reports help and parse errors without exiting", () => {
  assert.deepEqual(
    LocalEdgeCore_parseLogsCli({
      argv: ["tail", "--help"],
      defaultLines: "1000",
      defaultCharsPerToken: "4",
    }),
    { ok: false, kind: "help", includeUsage: true, exitCode: 0 },
  );

  assert.deepEqual(
    LocalEdgeCore_parseLogsCli({
      argv: ["tail", "--scope=unknown"],
      defaultLines: "1000",
      defaultCharsPerToken: "4",
    }),
    {
      ok: false,
      kind: "error",
      message: "Unsupported --scope value 'unknown'.",
      includeUsage: false,
      exitCode: 1,
    },
  );
});

test("LocalEdgeCore_parseLogsCli reports unknown options with usage", () => {
  assert.deepEqual(
    LocalEdgeCore_parseLogsCli({
      argv: ["tail", "--bogus"],
      defaultLines: "1000",
      defaultCharsPerToken: "4",
    }),
    {
      ok: false,
      kind: "error",
      message: "Unknown option: --bogus",
      includeUsage: true,
      exitCode: 1,
    },
  );
});

test("LocalEdgeCore_validateParsedLogsCli preserves selector validation messages", () => {
  const parsed = LocalEdgeCore_parseLogsCli({
    argv: ["tail", "--chars-per-token", "3"],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      LocalEdgeCore_validateParsedLogsCli(parsed.parsed),
      "--chars-per-token requires --tokens selector.",
    );
  }
});

test("LocalEdgeCore_buildLogsFollowSelectorArgs builds tail args", () => {
  const parsed = LocalEdgeCore_parseLogsCli({
    argv: ["tail", "--tokens", "3", "--chars-per-token", "2.5"],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(LocalEdgeCore_buildLogsFollowSelectorArgs(parsed.parsed), ["-c", "8"]);
    assert.deepEqual(LocalEdgeCore_buildLogsHistoryTailArgs(parsed.parsed, "/tmp/log"), [
      "-c",
      "8",
      "/tmp/log",
    ]);
  }
});

test("LocalEdgeCore_logs helpers format lines and defaults", () => {
  assert.equal(LocalEdgeCore_formatLogsInfoLine("hello"), "[local-edge:logs] hello");
  assert.equal(LocalEdgeCore_formatLogsErrorLine("bad"), "[local-edge:logs] bad");
  assert.equal(LocalEdgeCore_logsTokensToCharBudget({ tokens: 1, charsPerToken: 0.1 }), 1);
  assert.equal(LocalEdgeCore_logsTokensToCharBudget({ tokens: 2, charsPerToken: 2.5 }), 5);
  assert.equal(LocalEdgeCore_parseLogsEnvPositiveInt("0", 1000), 1000);
  assert.equal(LocalEdgeCore_parseLogsEnvPositiveInt("42", 1000), 42);
  assert.equal(LocalEdgeCore_parseLogsEnvNumber("2.5", 4), 2.5);
  assert.deepEqual(LocalEdgeCore_normalizeLogsArgv(["--scope", "all"]), [
    "tail",
    "--scope",
    "all",
  ]);
  assert.match(LocalEdgeCore_renderLogsUsage(), /logs\.ts tail \[options\]/);
});

test("LocalEdgeCore_buildLogsPathLayout renders the standard local-edge log paths", () => {
  assert.deepEqual(LocalEdgeCore_buildLogsPathLayout("/repo"), {
    localEdgeLogDir: "/repo/logs/local-edge",
    runLogDir: "/repo/logs/local-edge/runs",
    runLogLatestLink: "/repo/logs/local-edge/runs/latest.log",
    runLogPattern: "local-edge-*.log",
  });
});

test("LocalEdgeCore_resolveLogsScopeFiles resolves run and static scope files", () => {
  const pathLayout = LocalEdgeCore_buildLogsPathLayout("/repo");
  const existing = new Set([
    "/repo/logs/local-edge/runs/latest.log",
    "/repo/logs/local-edge/nginx-docker.log",
  ]);
  const parsed = LocalEdgeCore_parseLogsCli({
    argv: ["history", "--scope", "all"],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(
      LocalEdgeCore_resolveLogsScopeFiles({
        parsed: parsed.parsed,
        pathLayout,
        fileExists: (filePath) => existing.has(filePath),
        resolveLatestRunLog: () => "/repo/logs/local-edge/runs/latest.log",
        resolveRunLogByIndex: (indexOneBased) =>
          `/repo/logs/local-edge/runs/${String(indexOneBased)}.log`,
      }),
      [
        "/repo/logs/local-edge/runs/latest.log",
        "/repo/logs/local-edge/nginx-docker.log",
      ],
    );
  }
});

test("LocalEdgeCore_resolveLogsScopeFiles honors indexed run log selection", () => {
  const pathLayout = LocalEdgeCore_buildLogsPathLayout("/repo");
  const parsed = LocalEdgeCore_parseLogsCli({
    argv: ["history", "--scope", "run", "--run-index", "3"],
    defaultLines: "1000",
    defaultCharsPerToken: "4",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(
      LocalEdgeCore_resolveLogsScopeFiles({
        parsed: parsed.parsed,
        pathLayout,
        fileExists: () => true,
        resolveLatestRunLog: () => "/repo/logs/local-edge/runs/latest.log",
        resolveRunLogByIndex: (indexOneBased) =>
          `/repo/logs/local-edge/runs/${String(indexOneBased)}.log`,
      }),
      ["/repo/logs/local-edge/runs/3.log"],
    );
  }
});
