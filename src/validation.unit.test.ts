/**
 * @fileoverview Verifies product-neutral `LocalEdgeCore_*` validation helpers for TCP ports,
 * positive integers, strict-start env interpretation, warn-or-throw routing, required file paths,
 * and leading command-token extraction used by local-edge adapters.
 *
 * This file owns Node test regression coverage for the pure helpers exported from `validation.ts`,
 * including numeric bounds checks, truthy env parsing, filesystem existence probes, and shell
 * command string normalization.
 * Flow: build representative strings, env maps, temp paths, or argv fragments -> invoke helpers ->
 * assert `{ ok: true }` outcomes, structured `{ ok: false, message }` failures, or thrown errors.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/validation.unit.test.ts
 *
 * @see packages/local-edge-core/src/validation.ts - Port, integer, strict-mode, filesystem, and command-token validation helpers under test whose success and failure shapes are asserted here.
 * @see packages/local-edge-kit/src/lifecycle-plans.ts - Kit lifecycle orchestration that calls `LocalEdgeCore_shouldFailHard` and `LocalEdgeCore_validatePositiveInteger`, so regressions in strict-start or bound checks can surface as setup-time failures.
 * @see scripts/local-edge/lib-validation.ts - Root local-edge adapter module that re-exports these helpers for script-level env validation, aligning hosted local-edge flows with the contracts verified in this test module.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_extractCommandBin,
  LocalEdgeCore_requireFilePath,
  LocalEdgeCore_shouldFailHard,
  LocalEdgeCore_validatePort,
  LocalEdgeCore_validatePositiveInteger,
  LocalEdgeCore_warnOrFail,
} from "./validation.js";

test("LocalEdgeCore_validatePort accepts and rejects TCP port bounds", () => {
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "443" }).ok, true);
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "1" }).ok, true);
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "65535" }).ok, true);
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "abc" }).ok, false);
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "0" }).ok, false);
  assert.equal(LocalEdgeCore_validatePort({ label: "test", value: "70000" }).ok, false);
});

test("LocalEdgeCore_validatePositiveInteger accepts integers >= 1", () => {
  assert.equal(
    LocalEdgeCore_validatePositiveInteger({ label: "test", value: "1" }).ok,
    true,
  );
  assert.equal(
    LocalEdgeCore_validatePositiveInteger({ label: "test", value: "0" }).ok,
    false,
  );
  assert.equal(
    LocalEdgeCore_validatePositiveInteger({ label: "test", value: "x" }).ok,
    false,
  );
});

test("LocalEdgeCore_shouldFailHard reads strict-start truthy tokens", () => {
  assert.equal(LocalEdgeCore_shouldFailHard({}), false);
  assert.equal(LocalEdgeCore_shouldFailHard({ LOCAL_EDGE_STRICT_START: "true" }), true);
  assert.equal(LocalEdgeCore_shouldFailHard({ LOCAL_EDGE_STRICT_START: "1" }), true);
  assert.equal(LocalEdgeCore_shouldFailHard({ LOCAL_EDGE_STRICT_START: "false" }), false);
});

test("LocalEdgeCore_warnOrFail warns before optional strict failure", () => {
  const warnings: string[] = [];
  LocalEdgeCore_warnOrFail({
    message: "non-strict",
    strict: false,
    warnFn: (message) => warnings.push(message),
  });
  assert.deepEqual(warnings, ["non-strict"]);

  assert.throws(
    () =>
      LocalEdgeCore_warnOrFail({
        message: "strict",
        strict: true,
        warnFn: (message) => warnings.push(message),
      }),
    /strict/,
  );
  assert.deepEqual(warnings, ["non-strict", "strict"]);
});

test("LocalEdgeCore_requireFilePath checks existence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-validation-"));
  try {
    const existingPath = path.join(tempDir, "file.txt");
    fs.writeFileSync(existingPath, "ok", "utf8");
    assert.equal(
      LocalEdgeCore_requireFilePath({ filePath: existingPath, description: "fixture" }).ok,
      true,
    );
    const missing = LocalEdgeCore_requireFilePath({
      filePath: path.join(tempDir, "missing.txt"),
      description: "fixture",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.match(missing.message, /Missing file/);
    }
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test("LocalEdgeCore_extractCommandBin normalizes the leading command token", () => {
  assert.equal(LocalEdgeCore_extractCommandBin("docker compose up"), "docker");
  assert.equal(LocalEdgeCore_extractCommandBin("  docker info"), "docker");
  assert.equal(LocalEdgeCore_extractCommandBin('"docker" compose'), "docker");
  assert.equal(LocalEdgeCore_extractCommandBin(""), "");
});
