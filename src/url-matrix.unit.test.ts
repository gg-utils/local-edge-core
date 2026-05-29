/**
 * @fileoverview Verifies local-edge core URL-matrix helpers for HTTPS URL formatting, printable URL
 * matrix lines, and argv parsing for URL-matrix commands.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` exports from `url-matrix.js`,
 * keeping deterministic HTTPS URLs, labeled matrix rows, and CLI parse/error contracts stable for
 * kit callers.
 * Flow: build host/port/path fixtures or argv slices -> invoke formatters, builders, or parsers ->
 * assert string output, matrix lines, parsed options, or thrown error messages.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/url-matrix.unit.test.ts
 *
 * @see packages/local-edge-core/src/url-matrix.ts - Core URL-matrix primitives under test for HTTPS formatting, matrix line assembly, and argv parsing asserted here.
 * @see packages/local-edge-kit/src/urls-cli.ts - Kit `urls` subcommand that calls `LocalEdgeCore_parseUrlMatrixCliArgs` and matrix builders so operator output stays aligned with the contracts verified here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildUrlMatrixLines,
  LocalEdgeCore_formatHttpsUrl,
  LocalEdgeCore_parseUrlMatrixCliArgs,
} from "./url-matrix.js";

test("LocalEdgeCore_formatHttpsUrl omits port 443 and preserves custom ports", () => {
  assert.equal(
    LocalEdgeCore_formatHttpsUrl({
      host: "www.main.nginx-docker.dev.local.test",
      port: 443,
      requestPath: "status",
    }),
    "https://www.main.nginx-docker.dev.local.test/status",
  );
  assert.equal(
    LocalEdgeCore_formatHttpsUrl({
      host: "www.main.nginx-docker.dev.local.test",
      port: 4443,
      requestPath: "/status",
    }),
    "https://www.main.nginx-docker.dev.local.test:4443/status",
  );
});

test("LocalEdgeCore_buildUrlMatrixLines renders generic surface app/status pairs", () => {
  assert.deepEqual(
    LocalEdgeCore_buildUrlMatrixLines({
      method: "nginx-docker",
      listenHost: "127.0.0.1",
      port: 443,
      developerSlug: "dev",
      realmSlug: "main",
      rootZone: "local.test",
      surfaces: [
        {
          surface: "app",
          appPath: "/",
          statusPath: "/status",
        },
      ],
    }),
    [
      "[local-edge:nginx-docker] URL matrix (background-ready, bind=127.0.0.1:443):",
      "[local-edge:nginx-docker] app=app https://app.main.nginx-docker.dev.local.test/",
      "[local-edge:nginx-docker] status=app https://app.main.nginx-docker.dev.local.test/status",
    ],
  );
});

test("LocalEdgeCore_parseUrlMatrixCliArgs preserves URL matrix method selectors", () => {
  assert.deepEqual(
    LocalEdgeCore_parseUrlMatrixCliArgs({
      args: [],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:urls",
    }),
    { method: "nginx-docker", help: false },
  );
  assert.deepEqual(
    LocalEdgeCore_parseUrlMatrixCliArgs({
      args: ["--method", "primary"],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:urls",
    }),
    { method: "primary", help: false },
  );
  assert.deepEqual(
    LocalEdgeCore_parseUrlMatrixCliArgs({
      args: ["--method=all"],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:urls",
    }),
    { method: "all", help: false },
  );
  assert.deepEqual(
    LocalEdgeCore_parseUrlMatrixCliArgs({
      args: ["--help"],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:urls",
    }),
    { method: "nginx-docker", help: true },
  );
});

test("LocalEdgeCore_parseUrlMatrixCliArgs preserves URL matrix errors", () => {
  assert.throws(
    () =>
      LocalEdgeCore_parseUrlMatrixCliArgs({
        args: ["--method"],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        commandLabel: "local-edge:urls",
      }),
    /\[local-edge:urls\] Missing value for --method/,
  );
  assert.throws(
    () =>
      LocalEdgeCore_parseUrlMatrixCliArgs({
        args: ["--method="],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        commandLabel: "local-edge:urls",
      }),
    /\[local-edge:urls\] --method requires a value\./,
  );
});
