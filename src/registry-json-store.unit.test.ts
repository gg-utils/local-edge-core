/**
 * @fileoverview Verifies generic JSON registry read, write, validation hooks, atomic persistence,
 * and lock lifecycle for local-edge core registry store helpers.
 *
 * This file owns Node test regression coverage for `LocalEdgeCore_readRegistryJsonStore`,
 * `LocalEdgeCore_writeRegistryJsonStore`, and `LocalEdgeCore_withRegistryJsonLock` using a minimal
 * temp-backed adapter schema.
 * Flow: mkdtemp fixture -> build store options -> read or write with validation -> assert JSON
 * envelope, trailing newline, realm invariants, and lock file release on success and failure.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/registry-json-store.unit.test.ts
 *
 * @see packages/local-edge-core/src/registry-json-store.ts - Generic JSON registry filesystem mechanics, lock coordination, and validation entrypoints whose behavior is asserted in this module.
 * @see consumer local-edge adapter - consumer realm registry script that persists realm records through the same read/write helpers verified here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_readRegistryJsonStore,
  LocalEdgeCore_withRegistryJsonLock,
  LocalEdgeCore_writeRegistryJsonStore,
  type LocalEdgeCore_RegistryJsonStoreOptions,
} from "./registry-json-store.js";

/** Minimal schema used to exercise generic registry-store validation hooks. */
type TestRegistry = {
  schemaVersion: 1;
  updatedAt: string;
  realms: Record<string, { realmSlug: string }>;
};

/** Type guard for parsed JSON object maps in registry-store tests. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Builds a temp-backed generic registry store fixture. */
function buildTempStoreOptions(
  rootDir: string,
): LocalEdgeCore_RegistryJsonStoreOptions<TestRegistry> {
  const registryFilePath = path.join(rootDir, "registry", "realms.json");
  return {
    registryFilePath,
    registryLockFilePath: path.join(rootDir, "registry", "realms.lock"),
    createEmptyRegistry: () => ({ schemaVersion: 1, updatedAt: "empty", realms: {} }),
    validateRegistry: (value: unknown): TestRegistry => {
      if (!isRecord(value) || value["schemaVersion"] !== 1 || !isRecord(value["realms"])) {
        throw new Error("test-registry-invalid");
      }

      const realms: Record<string, { realmSlug: string }> = {};
      for (const [realmSlug, realmValue] of Object.entries(value["realms"])) {
        if (!isRecord(realmValue) || realmValue["realmSlug"] !== realmSlug) {
          throw new Error("test-registry-invalid-realm");
        }
        realms[realmSlug] = { realmSlug };
      }

      return {
        schemaVersion: 1,
        updatedAt: typeof value["updatedAt"] === "string" ? value["updatedAt"] : "",
        realms,
      };
    },
    prepareRegistryForWrite: (registry) => ({ ...registry, updatedAt: "written" }),
    lockRetryMs: 1,
    lockMaxAttempts: 2,
    errorPrefix: "[local-edge-core:test-registry]",
  };
}

test("LocalEdgeCore_readRegistryJsonStore returns an empty registry when absent", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-edge-core-registry-"));
  const store = buildTempStoreOptions(rootDir);

  assert.deepEqual(await LocalEdgeCore_readRegistryJsonStore(store), {
    schemaVersion: 1,
    updatedAt: "empty",
    realms: {},
  });
});

test("LocalEdgeCore_writeRegistryJsonStore validates and writes atomically", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-edge-core-registry-write-"));
  const store = buildTempStoreOptions(rootDir);

  await LocalEdgeCore_writeRegistryJsonStore({
    store,
    registry: {
      schemaVersion: 1,
      updatedAt: "before",
      realms: { demo: { realmSlug: "demo" } },
    },
  });

  const raw = await fs.readFile(store.registryFilePath, "utf8");
  assert.equal(raw.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(raw), {
    schemaVersion: 1,
    updatedAt: "written",
    realms: { demo: { realmSlug: "demo" } },
  });
});

test("LocalEdgeCore_withRegistryJsonLock mutates and releases locks", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-edge-core-registry-lock-"));
  const store = buildTempStoreOptions(rootDir);

  const result = await LocalEdgeCore_withRegistryJsonLock({
    store,
    operation: async (registry) => {
      registry.realms.demo = { realmSlug: "demo" };
      return "ok";
    },
  });

  assert.equal(result, "ok");
  assert.deepEqual((await LocalEdgeCore_readRegistryJsonStore(store)).realms, {
    demo: { realmSlug: "demo" },
  });
  await assert.rejects(() => fs.access(store.registryLockFilePath), /ENOENT/);
});

test("LocalEdgeCore_withRegistryJsonLock releases locks when operations fail", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-edge-core-registry-error-"));
  const store = buildTempStoreOptions(rootDir);

  await assert.rejects(
    () =>
      LocalEdgeCore_withRegistryJsonLock({
        store,
        operation: async () => {
          throw new Error("operation-failed");
        },
      }),
    /operation-failed/,
  );

  await assert.rejects(() => fs.access(store.registryLockFilePath), /ENOENT/);
});
