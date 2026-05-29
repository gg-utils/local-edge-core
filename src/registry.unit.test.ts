/**
 * @fileoverview Verifies realm registry schema validation, lifecycle status parsing, and slug-indexed
 * file envelope construction for local-edge core realm records.
 *
 * This file owns Node test regression coverage for `LocalEdgeCore_validateRealmStatus`,
 * `LocalEdgeCore_validateRealmRecord`, and `LocalEdgeCore_createRealmRegistryFile` using neutral
 * fixture data with no product-specific semantics.
 * Flow: build neutral realm record -> validate status and record shapes -> assert registry file maps
 * realms by slug and preserves schema version metadata.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/registry.unit.test.ts
 *
 * @see packages/local-edge-core/src/registry.ts - Realm registry schema constants, validators, and file builder whose contracts are exercised by the assertions in this module.
 * @see packages/local-edge-core/src/registry-json-store.ts - Generic JSON registry persistence layer that reads and writes the realm registry file shape validated here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
  LocalEdgeCore_createRealmRegistryFile,
  LocalEdgeCore_validateRealmRecord,
  LocalEdgeCore_validateRealmStatus,
  type LocalEdgeCore_RealmRecord,
} from "./registry.js";

/** Builds a neutral registry row fixture with no product-specific semantics. */
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
    workspace: {
      type: "external-consumer",
      path: "/tmp/local-edge-demo",
    },
    upstreams: {
      web: { host: "127.0.0.1", port: 3000 },
    },
    artifactPaths: {
      realmRoot: "/tmp/local-edge-demo/.tmp/local-edge/realms/demo",
      metadataPath: "/tmp/local-edge-demo/.tmp/local-edge/realms/demo/metadata.json",
      envDir: "/tmp/local-edge-demo/.tmp/local-edge/realms/demo/env",
    },
    timestamps: {
      createdAt: "2026-05-19T00:00:00.000Z",
      registeredAt: "2026-05-19T00:01:00.000Z",
      lastSeenAt: "2026-05-19T00:02:00.000Z",
    },
  };
}

test("LocalEdgeCore_validateRealmStatus accepts known lifecycle states", () => {
  assert.equal(LocalEdgeCore_validateRealmStatus("active"), "active");
  assert.equal(LocalEdgeCore_validateRealmStatus("inactive"), "inactive");
  assert.equal(LocalEdgeCore_validateRealmStatus("stale"), "stale");
  assert.throws(() => LocalEdgeCore_validateRealmStatus("unknown"), /unsupported-realm-status/);
});

test("LocalEdgeCore_validateRealmRecord validates neutral realm records", () => {
  assert.deepEqual(LocalEdgeCore_validateRealmRecord(buildRealmRecord()), buildRealmRecord());
});

test("LocalEdgeCore_validateRealmRecord rejects invalid upstream ports", () => {
  const record = buildRealmRecord();
  record.upstreams.web = { host: "127.0.0.1", port: 0 };

  assert.throws(
    () => LocalEdgeCore_validateRealmRecord(record),
    /missing-positive-number-port/,
  );
});

test("LocalEdgeCore_createRealmRegistryFile indexes records by slug", () => {
  assert.deepEqual(
    LocalEdgeCore_createRealmRegistryFile({
      updatedAt: "2026-05-19T00:03:00.000Z",
      realms: [buildRealmRecord()],
    }),
    {
      schemaVersion: LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
      updatedAt: "2026-05-19T00:03:00.000Z",
      realms: {
        demo: buildRealmRecord(),
      },
    },
  );
});
