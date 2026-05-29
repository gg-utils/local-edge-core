/**
 * @fileoverview Verifies the with-logs helper contracts for formatter-state TSV, usage text,
 * shutdown-prefix assembly, lifecycle notices, runtime-exit lines, EPIPE-only ignorable stdout
 * classification, and strict argv parsing used by local-edge log compatibility wrappers.
 *
 * This file owns `node:test` suites that exercise pure `LocalEdgeCore_withLogs*` helpers imported
 * from `with-logs.ts` without spawning subprocesses. Flow: build inputs or argv arrays -> call
 * helper -> assert string equality, regex matches, or thrown parse errors.
 *
 * @testing Node.js test runner: node node_modules/tsx/dist/cli.mjs --test packages/local-edge-core/src/with-logs.unit.test.ts
 *
 * @see packages/local-edge-core/src/with-logs.ts - Implementation under test owning shutdown prefix constants, lifecycle templates, argv parsing, and usage text asserted here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository standard governing the file-overview block shape, tag order, and audit metadata used here.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_EDGE_CORE_WITH_LOGS_SHUTDOWN_PREFIX,
  LocalEdgeCore_withLogsFormatLifecycleEvent,
  LocalEdgeCore_withLogsFormatRuntimeExit,
  LocalEdgeCore_withLogsFormatShutdownParentLine,
  LocalEdgeCore_withLogsIsIgnorableStdoutError,
  LocalEdgeCore_withLogsParseArgv,
  LocalEdgeCore_withLogsRenderUsage,
  LocalEdgeCore_withLogsResolveFormatterStateTsv,
} from "./with-logs.js";

test("LocalEdgeCore_withLogsResolveFormatterStateTsv defaults to formatted", () => {
  assert.equal(LocalEdgeCore_withLogsResolveFormatterStateTsv({}), "formatted\ttrue\ttrue");
});

test("LocalEdgeCore_withLogsRenderUsage describes compatibility subcommands", () => {
  const usage = LocalEdgeCore_withLogsRenderUsage();
  assert.match(usage, /Usage: with-logs\.ts <command> \[options\]/);
  assert.match(usage, /resolve-formatter-state/);
  assert.match(usage, /format-runtime-exit --exit-code <n>/);
});

test("LocalEdgeCore_withLogsResolveFormatterStateTsv selects raw mode", () => {
  assert.equal(
    LocalEdgeCore_withLogsResolveFormatterStateTsv({
      LOCAL_EDGE_LOG_OUTPUT_FORMAT: "raw",
    }),
    "raw\tfalse\tfalse",
  );
});

test("LocalEdgeCore_withLogsFormatShutdownParentLine uses the stable prefix", () => {
  assert.equal(
    LocalEdgeCore_withLogsFormatShutdownParentLine("test message"),
    `${LOCAL_EDGE_CORE_WITH_LOGS_SHUTDOWN_PREFIX}test message`,
  );
});

test("LocalEdgeCore_withLogsFormatLifecycleEvent maps reclaim and checkout errors", () => {
  assert.equal(
    LocalEdgeCore_withLogsFormatLifecycleEvent({
      kind: "reclaim_session",
      projectRoot: "/tmp/proj",
    }),
    "[local-edge] Reclaiming an older local session for /tmp/proj before starting a new one.",
  );

  assert.equal(
    LocalEdgeCore_withLogsFormatLifecycleEvent({
      kind: "checkout_kind_resolve_failed",
      projectRoot: "/x",
    }),
    "[local-edge] ERROR: Failed to resolve checkout kind for /x.",
  );
});

test("LocalEdgeCore_withLogsFormatRuntimeExit matches the shutdown line helper", () => {
  assert.equal(
    LocalEdgeCore_withLogsFormatRuntimeExit(0),
    LocalEdgeCore_withLogsFormatShutdownParentLine("Runtime process exited with code 0."),
  );
});

test("LocalEdgeCore_withLogsIsIgnorableStdoutError recognizes EPIPE only on Error instances", () => {
  const epipe = new Error("write EPIPE");
  Object.defineProperty(epipe, "code", { value: "EPIPE" });

  const eacces = new Error("write EACCES");
  Object.defineProperty(eacces, "code", { value: "EACCES" });

  assert.equal(LocalEdgeCore_withLogsIsIgnorableStdoutError(epipe), true);
  assert.equal(LocalEdgeCore_withLogsIsIgnorableStdoutError(eacces), false);
  assert.equal(LocalEdgeCore_withLogsIsIgnorableStdoutError({ code: "EPIPE" }), false);
});

test("LocalEdgeCore_withLogsParseArgv parses format-runtime-exit", () => {
  assert.deepEqual(
    LocalEdgeCore_withLogsParseArgv([
      "node",
      "with-logs.ts",
      "format-runtime-exit",
      "--exit-code",
      "3",
    ]),
    { command: "format-runtime-exit", exitCode: 3 },
  );
});

test("LocalEdgeCore_withLogsParseArgv rejects invalid exit code", () => {
  assert.throws(
    () =>
      LocalEdgeCore_withLogsParseArgv([
        "node",
        "with-logs.ts",
        "format-runtime-exit",
        "--exit-code",
        "nope",
      ]),
    /Invalid/,
  );
});

test("LocalEdgeCore_withLogsParseArgv parses required path flags", () => {
  assert.deepEqual(
    LocalEdgeCore_withLogsParseArgv(["node", "with-logs.ts", "print-prelude", "--log-file", "/x"]),
    { command: "print-prelude", logFile: "/x" },
  );
  assert.deepEqual(
    LocalEdgeCore_withLogsParseArgv([
      "node",
      "with-logs.ts",
      "format-reclaim-notice",
      "--project-root",
      "/repo",
    ]),
    { command: "format-reclaim-notice", projectRoot: "/repo" },
  );
});
