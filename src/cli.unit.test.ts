/**
 * @fileoverview Verifies the `local-edge-core` package CLI argv parsing and JSON dry-run rendering
 * helpers.
 *
 * This file owns regression coverage for `LocalEdgeCore_parseCliArgs`,
 * `LocalEdgeCore_parseRenderCliArgs`, and `LocalEdgeCore_renderCliOutput` used by adapter-owned
 * command wrappers.
 * Flow: build argv or options objects -> assert parsed flags, rendered JSON payloads, and
 * validation errors match the contracts enforced in `cli.ts`.
 *
 * @example
 * ```typescript
 * test("parses global dry-run manifest flags", () => {
 *   assert.deepEqual(
 *     LocalEdgeCore_parseCliArgs([
 *       "--manifest",
 *       "./manifest.json",
 *       "--dry-run",
 *       "--format",
 *       "json",
 *     ]),
 *     {
 *       dryRun: true,
 *       format: "json",
 *       manifestPath: "./manifest.json",
 *       help: false,
 *     },
 *   );
 * });
 * ```
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/cli.unit.test.ts
 *
 * @see packages/local-edge-core/src/cli.ts - Minimal package-core CLI shell that implements the parsers and `LocalEdgeCore_renderCliOutput` JSON plan asserted in this module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract this header follows for verification tooling and reviews.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_parseCliArgs,
  LocalEdgeCore_parseRenderCliArgs,
  LocalEdgeCore_renderCliOutput,
} from "./cli.js";

test("LocalEdgeCore_parseCliArgs parses global dry-run manifest flags", () => {
  assert.deepEqual(
    LocalEdgeCore_parseCliArgs([
      "--manifest",
      "./manifest.json",
      "--dry-run",
      "--format",
      "json",
    ]),
    {
      dryRun: true,
      format: "json",
      manifestPath: "./manifest.json",
      help: false,
    },
  );
});

test("LocalEdgeCore_renderCliOutput returns JSON dry-run payload", () => {
  assert.equal(
    LocalEdgeCore_renderCliOutput({
      dryRun: true,
      format: "json",
      manifestPath: "./manifest.json",
      help: false,
    }),
    JSON.stringify(
      {
        command: "local-edge-core-cli-dry-run-plan",
        dryRun: true,
        manifestPath: "./manifest.json",
      },
      null,
      2,
    ),
  );
});

test("LocalEdgeCore_parseRenderCliArgs preserves render method and check flags", () => {
  assert.deepEqual(
    LocalEdgeCore_parseRenderCliArgs({
      args: ["--method", "all", "--dry-run"],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:render",
    }),
    { method: "all", mode: "check" },
  );

  assert.deepEqual(
    LocalEdgeCore_parseRenderCliArgs({
      args: [],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:render",
    }),
    { method: "nginx-docker", mode: "execute" },
  );

  assert.throws(
    () =>
      LocalEdgeCore_parseRenderCliArgs({
        args: ["--unknown"],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        commandLabel: "local-edge:render",
      }),
    /\[local-edge:render\] Unknown option: --unknown/,
  );
});
