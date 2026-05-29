/**
 * @fileoverview Verifies pure local-edge hostname builders for joining explicit realm/surface label
 * tuples and for producing per-surface hostname matrices, including empty-segment rejection.
 *
 * This file owns Node test regression coverage for `LocalEdgeCore_buildHostnameFromParts` and
 * `LocalEdgeCore_buildHostnamesForSurfaces` from `hostname.js`, asserting deterministic label
 * ordering and stable error tokens for invalid inputs.
 * Flow: build representative hostname parts or matrix options -> invoke builders -> assert joined
 * hostnames or thrown error patterns.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/hostname.unit.test.ts
 *
 * @see packages/local-edge-core/src/hostname.ts - Product-neutral hostname string builders under test whose join rules and validation errors are asserted here.
 * @see packages/local-edge-core/src/route-plan.ts - Route-planning module that calls `LocalEdgeCore_buildHostnameFromParts` when materializing per-surface hostnames from manifests.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildHostnameFromParts,
  LocalEdgeCore_buildHostnamesForSurfaces,
} from "./hostname.js";

test("LocalEdgeCore_buildHostnameFromParts joins explicit realm parts", () => {
  assert.equal(
    LocalEdgeCore_buildHostnameFromParts({
      surface: "www",
      realmSlug: "main",
      method: "nginx-docker",
      developerSlug: "dev-machine",
      rootZone: "local.example.test",
    }),
    "www.main.nginx-docker.dev-machine.local.example.test",
  );
});

test("LocalEdgeCore_buildHostnamesForSurfaces builds a generic matrix", () => {
  assert.deepEqual(
    LocalEdgeCore_buildHostnamesForSurfaces({
      surfaces: ["www", "api"],
      realmSlug: "demo",
      method: "nginx-docker",
      developerSlug: "developer",
      rootZone: "local.example.test",
    }),
    {
      www: "www.demo.nginx-docker.developer.local.example.test",
      api: "api.demo.nginx-docker.developer.local.example.test",
    },
  );
});

test("LocalEdgeCore_buildHostnameFromParts rejects empty labels", () => {
  assert.throws(
    () =>
      LocalEdgeCore_buildHostnameFromParts({
        surface: "",
        realmSlug: "main",
        method: "nginx-docker",
        developerSlug: "dev-machine",
        rootZone: "local.example.test",
      }),
    /local-edge-core-hostname-empty-surface/,
  );
});
