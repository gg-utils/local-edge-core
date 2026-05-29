/**
 * @fileoverview Verifies product-neutral system helpers used by local-edge adapters: macOS
 * detection, `$PATH` command resolution (including Docker Desktop fallbacks on macOS),
 * interactive-terminal detection, canonical path resolution, artifact directory writes, and
 * required-utility validation envelopes.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` system exports from
 * `system.js`, keeping OS-aware command discovery and small filesystem artifact helpers stable for
 * core and downstream kit callers.
 * Flow: call helper with controlled inputs or a temp artifacts directory -> assert booleans,
 * resolved paths, file contents, or `LocalEdgeCore_requireUtility` success and failure messages.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/system.unit.test.ts
 *
 * @see packages/local-edge-core/src/system.ts - System helper module under test for platform checks, PATH resolution, artifact writes, and utility validation asserted here.
 * @see packages/local-edge-core/src/index.ts - Package entry barrel that re-exports the system helpers verified here to downstream local-edge kit and CLI packages.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_canonicalPath,
  LocalEdgeCore_commandExists,
  LocalEdgeCore_hasInteractiveTerminal,
  LocalEdgeCore_isMacos,
  LocalEdgeCore_requireUtility,
  LocalEdgeCore_resolveCommandPath,
  LocalEdgeCore_writeArtifact,
} from "./system.js";

test("LocalEdgeCore_isMacos reflects the Node platform", () => {
  assert.equal(LocalEdgeCore_isMacos(), process.platform === "darwin");
});

test("LocalEdgeCore_resolveCommandPath and commandExists handle empty and known commands", () => {
  assert.equal(LocalEdgeCore_resolveCommandPath(""), null);
  assert.equal(LocalEdgeCore_commandExists(""), false);
  assert.equal(LocalEdgeCore_commandExists("node"), true);
  assert.match(LocalEdgeCore_resolveCommandPath("node") ?? "", /node/);
});

test("LocalEdgeCore_hasInteractiveTerminal returns a boolean", () => {
  assert.equal(typeof LocalEdgeCore_hasInteractiveTerminal(), "boolean");
});

test("LocalEdgeCore_canonicalPath resolves an existing path", () => {
  assert.equal(LocalEdgeCore_canonicalPath(process.cwd()), fs.realpathSync(process.cwd()));
});

test("LocalEdgeCore_writeArtifact creates the artifact directory and file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-system-"));
  try {
    const artifactsDir = path.join(tempDir, "artifacts");
    LocalEdgeCore_writeArtifact({
      artifactsDir,
      name: "run.txt",
      content: "ok\n",
    });
    assert.equal(fs.readFileSync(path.join(artifactsDir, "run.txt"), "utf8"), "ok\n");
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test("LocalEdgeCore_requireUtility reports known and missing utilities", () => {
  assert.equal(LocalEdgeCore_requireUtility({ utility: "node" }).ok, true);
  const missing = LocalEdgeCore_requireUtility({
    utility: "local-edge-definitely-missing-command",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.message, /Required utility not found/);
  }
});
