/**
 * @fileoverview Regression coverage for `packages/local-edge-core/src/log-output.ts` helpers
 * that normalize log format flags, derive color enablement, render startup preludes, and emit
 * legacy `[local-edge]` line prefixes to stdout or stderr.
 *
 * This file owns `node:test` suites that assert pure helpers directly and temporarily replace
 * `process.stdout.write` / `process.stderr.write` only while exercising the log writers and section
 * renderer. Flow: call LocalEdgeCore_* helper -> compare strings or captured chunks -> restore
 * stream writers in `finally`.
 *
 * @testing Node.js test runner: node node_modules/tsx/dist/cli.mjs --test packages/local-edge-core/src/log-output.unit.test.ts
 *
 * @see packages/local-edge-core/src/log-output.ts - Source module under test defining formatter tokens, color precedence, prelude assembly, and stream writers consumed by these assertions.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository standard governing the file-overview block shape, tag order, and audit metadata used here.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildWithLogsPrelude,
  LocalEdgeCore_isTruthy,
  LocalEdgeCore_logColorEnabled,
  LocalEdgeCore_logError,
  LocalEdgeCore_logFormatterActiveValue,
  LocalEdgeCore_logFormatterEnabled,
  LocalEdgeCore_logInfo,
  LocalEdgeCore_logSection,
  LocalEdgeCore_logSuccess,
  LocalEdgeCore_logWarn,
  LocalEdgeCore_resolveLogOutputFormat,
} from "./log-output.js";

test("LocalEdgeCore_isTruthy preserves compatibility token semantics", () => {
  assert.equal(LocalEdgeCore_isTruthy("1"), true);
  assert.equal(LocalEdgeCore_isTruthy("true"), true);
  assert.equal(LocalEdgeCore_isTruthy("TRUE"), true);
  assert.equal(LocalEdgeCore_isTruthy("yes"), true);
  assert.equal(LocalEdgeCore_isTruthy("YES"), true);
  assert.equal(LocalEdgeCore_isTruthy("false"), false);
  assert.equal(LocalEdgeCore_isTruthy(undefined), false);
});

test("LocalEdgeCore log output format helpers normalize formatter state", () => {
  assert.equal(LocalEdgeCore_resolveLogOutputFormat(undefined), "formatted");
  assert.equal(LocalEdgeCore_resolveLogOutputFormat("raw"), "raw");
  assert.equal(LocalEdgeCore_resolveLogOutputFormat("fancy"), "formatted");
  assert.equal(LocalEdgeCore_logFormatterEnabled("formatted"), true);
  assert.equal(LocalEdgeCore_logFormatterEnabled("raw"), false);
  assert.equal(LocalEdgeCore_logFormatterActiveValue("formatted"), "true");
  assert.equal(LocalEdgeCore_logFormatterActiveValue("raw"), "false");
});

test("LocalEdgeCore_logColorEnabled follows formatter, NO_COLOR, explicit, and TTY precedence", () => {
  assert.equal(
    LocalEdgeCore_logColorEnabled({
      formatterActive: true,
      noColor: undefined,
      colorMode: "always",
      isTtyStdout: true,
    }),
    false,
  );
  assert.equal(
    LocalEdgeCore_logColorEnabled({
      formatterActive: false,
      noColor: "1",
      colorMode: "always",
      isTtyStdout: true,
    }),
    false,
  );
  assert.equal(
    LocalEdgeCore_logColorEnabled({
      formatterActive: false,
      noColor: undefined,
      colorMode: "yes",
      isTtyStdout: false,
    }),
    true,
  );
  assert.equal(
    LocalEdgeCore_logColorEnabled({
      formatterActive: false,
      noColor: undefined,
      colorMode: "auto",
      isTtyStdout: true,
    }),
    true,
  );
});

test("LocalEdgeCore_buildWithLogsPrelude renders command labels from explicit inputs", () => {
  assert.equal(
    LocalEdgeCore_buildWithLogsPrelude({
      logFile: "/tmp/local-edge.log",
      tailRunLogsCommand: "tail run",
      tailAllLogsCommand: "tail all",
      recentRunLogCommand: "recent",
      runLogHistoryCommand: "history",
      sectionLabel: "Start",
    }),
    [
      "[local-edge] Logging to /tmp/local-edge.log",
      "[local-edge] Tail run logs: tail run",
      "[local-edge] Tail all logs: tail all",
      "[local-edge] Recent run log: recent",
      "[local-edge] Run log history: history",
      "[local-edge:section] Start",
      "",
    ].join("\n"),
  );
});

test("LocalEdgeCore log writers preserve legacy stdout and stderr prefixes", () => {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  try {
    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    LocalEdgeCore_logInfo("hello", { colorEnabled: false });
    LocalEdgeCore_logSuccess("done", { colorEnabled: false });
    LocalEdgeCore_logWarn("careful", { colorEnabled: false });
    LocalEdgeCore_logError("failed", { colorEnabled: false });

    assert.equal(
      stdoutChunks.join(""),
      "[local-edge] hello\n[local-edge] OK: done\n",
    );
    assert.equal(
      stderrChunks.join(""),
      "[local-edge] WARNING: careful\n[local-edge] ERROR: failed\n",
    );
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
});

test("LocalEdgeCore_logSection emits formatter marker or divider block", () => {
  const stdoutChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write;

  try {
    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    LocalEdgeCore_logSection("Title", {
      colorEnabled: false,
      formatterActive: true,
    });
    assert.equal(stdoutChunks.join(""), "[local-edge:section] Title\n");

    stdoutChunks.length = 0;
    LocalEdgeCore_logSection("Title", {
      colorEnabled: false,
      formatterActive: false,
    });
    assert.match(stdoutChunks.join(""), /={10,}/);
    assert.match(stdoutChunks.join(""), /Title/);
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});
