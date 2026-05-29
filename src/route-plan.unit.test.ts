/**
 * @fileoverview Verifies manifest-driven route planning merges neutral realm hostnames with manifest
 * surfaces and runtime upstream wiring for `LocalEdgeCore_buildManifestRoutePlan`.
 *
 * This file owns Node `node:test` regression coverage for happy-path hostname resolution plus
 * validation failures when manifest upstream ids or realm runtime upstreams are inconsistent.
 * Flow: build toy manifest and realm record -> call `LocalEdgeCore_buildManifestRoutePlan` ->
 * assert resolved hostnames, upstreams, and thrown error messages.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/route-plan.unit.test.ts
 * @testing Node test runner (tsx): npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/route-plan.ts - Route-plan builder and validation rules whose merge semantics and failure messages are asserted here.
 * @see packages/local-edge-core/src/manifest.ts - Declarative manifest contract consumed by the toy fixtures when exercising surface and upstream references.
 * @see packages/local-edge-core/src/registry.ts - Neutral realm record and upstream shapes supplied by the fixtures to validate runtime upstream substitution and missing-upstream errors.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LocalEdgeCore_buildManifestRoutePlan } from "./route-plan.js";
import {
  LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
  type LocalEdgeCore_RealmRecord,
} from "./registry.js";
import type { LocalEdgeCore_Manifest } from "./manifest.js";

/** Builds a toy consumer manifest used to verify package-core route planning. */
function buildManifest(): LocalEdgeCore_Manifest {
  return {
    schemaVersion: 1,
    packageName: "toy-consumer",
    methods: ["nginx-docker"],
    upstreams: [{ id: "web", host: "127.0.0.1", port: 3000, protocol: "http" }],
    surfaces: [
      {
        id: "web",
        hostLabel: "www",
        upstreamId: "web",
        routeGroupId: "web",
        appPath: "/",
        statusPath: "/status",
        availability: { state: "local-edge-surface-availability-required" },
      },
    ],
  };
}

/** Builds a neutral realm record with runtime upstreams supplied by the adapter. */
function buildRealmRecord(): LocalEdgeCore_RealmRecord {
  return {
    schemaVersion: LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
    realmSlug: "demo",
    status: "active",
    method: "nginx-docker",
    hostnameParts: {
      developerSlug: "developer",
      rootZone: "local.example.test",
    },
    workspace: { type: "external-consumer", path: "/tmp/toy" },
    upstreams: {
      web: { host: "host.docker.internal", port: 3001 },
    },
    artifactPaths: { realmRoot: "/tmp/toy/.tmp/local-edge/realms/demo" },
    timestamps: {
      createdAt: "2026-05-19T00:00:00.000Z",
      registeredAt: "2026-05-19T00:01:00.000Z",
      lastSeenAt: "2026-05-19T00:02:00.000Z",
    },
  };
}

test("LocalEdgeCore_buildManifestRoutePlan resolves hostnames and runtime upstreams", () => {
  assert.deepEqual(
    LocalEdgeCore_buildManifestRoutePlan({
      manifest: buildManifest(),
      realmRecord: buildRealmRecord(),
    }),
    {
      realmSlug: "demo",
      method: "nginx-docker",
      surfaces: [
        {
          surfaceId: "web",
          hostLabel: "www",
          hostname: "www.demo.nginx-docker.developer.local.example.test",
          upstreamId: "web",
          upstream: { host: "host.docker.internal", port: 3001 },
          routeGroupId: "web",
          appPath: "/",
          statusPath: "/status",
          availability: { state: "local-edge-surface-availability-required" },
        },
      ],
    },
  );
});

test("LocalEdgeCore_buildManifestRoutePlan rejects unknown manifest upstream ids", () => {
  const manifest = buildManifest();
  manifest.surfaces = [{ ...manifest.surfaces[0], upstreamId: "missing" }];

  assert.throws(
    () =>
      LocalEdgeCore_buildManifestRoutePlan({
        manifest,
        realmRecord: buildRealmRecord(),
      }),
    /unknown manifest upstream 'missing'/,
  );
});

test("LocalEdgeCore_buildManifestRoutePlan rejects missing realm upstreams", () => {
  const realmRecord = buildRealmRecord();
  realmRecord.upstreams = {};

  assert.throws(
    () =>
      LocalEdgeCore_buildManifestRoutePlan({
        manifest: buildManifest(),
        realmRecord,
      }),
    /missing upstream 'web'/,
  );
});
