/**
 * @fileoverview Verifies argv parsing envelopes, validation errors, and usage rendering for local-edge
 * shell-shim subcommands.
 *
 * This file owns Node `node:test` regression coverage for `LocalEdgeCore_parseShellShimArgv`,
 * `LocalEdgeCore_renderShellShimUsage`, and `LocalEdgeCoreShellShimError` across the stable command
 * matrix and legacy parser error strings.
 * Flow: feed argv vectors -> assert parsed envelopes or thrown matcher text -> assert usage banner lists representative subcommands.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/shell-shim.unit.test.ts
 * @testing Node test runner (tsx): npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/shell-shim.ts - Product-neutral argv parser, usage renderer, and shim error definitions whose contracts and messages are asserted here.
 * @see consumer local-edge adapter - consumer shell adapter that imports the parse/usage helpers from core and performs stdout/stderr dispatch after argv parsing for operator workflows.
 * @see packages/local-edge-core/src/index.ts - Package barrel re-exporting the shell-shim surface next to other local-edge-core contracts this suite keeps aligned.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCoreShellShimError,
  LocalEdgeCore_parseShellShimArgv,
  LocalEdgeCore_renderShellShimUsage,
} from "./shell-shim.js";

test("LocalEdgeCore_parseShellShimArgv parses help and zero-arg commands", () => {
  assert.deepEqual(LocalEdgeCore_parseShellShimArgv([]), { command: "help" });
  assert.deepEqual(LocalEdgeCore_parseShellShimArgv(["--help"]), { command: "help" });
  assert.deepEqual(LocalEdgeCore_parseShellShimArgv(["resolve-formatter-state"]), {
    command: "resolve-formatter-state",
  });
});

test("LocalEdgeCore_parseShellShimArgv parses path and value commands", () => {
  assert.deepEqual(
    LocalEdgeCore_parseShellShimArgv(["print-prelude", "--log-file", "/tmp/run.log"]),
    { command: "print-prelude", logFile: "/tmp/run.log" },
  );
  assert.deepEqual(LocalEdgeCore_parseShellShimArgv(["is-truthy", "yes"]), {
    command: "is-truthy",
    value: "yes",
  });
  assert.deepEqual(LocalEdgeCore_parseShellShimArgv(["is-truthy"]), {
    command: "is-truthy",
    value: "false",
  });
  assert.deepEqual(
    LocalEdgeCore_parseShellShimArgv([
      "collect-active-env-files",
      "--project-root",
      "/repo",
    ]),
    { command: "collect-active-env-files", projectRoot: "/repo" },
  );
});

test("LocalEdgeCore_parseShellShimArgv parses artifact, URL matrix, and log-color commands", () => {
  assert.deepEqual(
    LocalEdgeCore_parseShellShimArgv([
      "normalize-legacy-artifact-path",
      "--machine-root",
      "/machine",
      "--raw",
      "",
    ]),
    {
      command: "normalize-legacy-artifact-path",
      machineRoot: "/machine",
      rawPath: "",
    },
  );
  assert.deepEqual(
    LocalEdgeCore_parseShellShimArgv([
      "print-method-url-matrix",
      "--method",
      "nginx-docker",
    ]),
    { command: "print-method-url-matrix", method: "nginx-docker" },
  );
  assert.deepEqual(
    LocalEdgeCore_parseShellShimArgv([
      "resolve-log-color-enabled",
      "--is-tty-stdout",
      "false",
    ]),
    { command: "resolve-log-color-enabled", isTtyStdout: false },
  );
});

test("LocalEdgeCore_parseShellShimArgv preserves legacy parser errors", () => {
  assert.throws(
    () => LocalEdgeCore_parseShellShimArgv(["resolve-formatter-state", "extra"]),
    /Unexpected arguments for resolve-formatter-state: extra/,
  );
  assert.throws(
    () => LocalEdgeCore_parseShellShimArgv(["print-prelude"]),
    /print-prelude requires --log-file <path>\./,
  );
  assert.throws(
    () =>
      LocalEdgeCore_parseShellShimArgv([
        "resolve-log-color-enabled",
        "--is-tty-stdout",
        "maybe",
      ]),
    /resolve-log-color-enabled requires --is-tty-stdout true\|false \(got 'maybe'\)\./,
  );
  assert.throws(
    () => LocalEdgeCore_parseShellShimArgv(["unknown"]),
    LocalEdgeCoreShellShimError,
  );
});

test("LocalEdgeCore_renderShellShimUsage lists the shell-shim command surface", () => {
  const usage = LocalEdgeCore_renderShellShimUsage();
  assert.match(usage, /Usage: lib-shell-shim\.ts <command> \[options\]/);
  assert.match(usage, /resolve-formatter-state/);
  assert.match(usage, /print-method-url-matrix --method <nginx-docker>/);
});
