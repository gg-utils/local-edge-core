/**
 * @fileoverview Verifies deterministic path helpers for local-edge machine roots, legacy nginx and
 * TLS artifact remaps, realm layout paths, and active env source file collection.
 *
 * This file owns Node `node:test` regression coverage for `paths.ts` contracts using synthetic
 * roots only (no filesystem reads and no reliance on `process.env`).
 * Flow: construct path strings -> call `LocalEdgeCore_*` helpers -> assert normalized outputs and
 * deduplicated env file ordering.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/paths.unit.test.ts
 * @testing Node test runner (tsx): npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/paths.ts - Pure path normalization and resolution helpers whose legacy-layout, TLS, realm, and env-source behavior is asserted here.
 * @see packages/local-edge-core/src/method-config.ts - Adapter module that imports these path helpers when deriving local-edge method configuration inputs from explicit roots.
 * @see packages/local-edge-core/src/index.ts - Package entry barrel that re-exports the path surface so downstream local-edge packages consume the same contracts exercised by this suite.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_collectActiveEnvSourceFiles,
  LocalEdgeCore_defaultEnvFilePath,
  LocalEdgeCore_normalizeLegacyArtifactPath,
  LocalEdgeCore_normalizeMachineRootDir,
  LocalEdgeCore_resolveRealmArtifactPaths,
  LocalEdgeCore_resolveTlsCertPath,
  LocalEdgeCore_resolveTlsKeyPath,
} from "./paths.js";

test("LocalEdgeCore_normalizeMachineRootDir accepts legacy generated path", () => {
  assert.equal(
    LocalEdgeCore_normalizeMachineRootDir(
      path.join("/tmp", "example", ".tmp", "local-edge", "generated"),
    ),
    path.join("/tmp", "example", ".tmp", "local-edge"),
  );
});

test("LocalEdgeCore_normalizeLegacyArtifactPath remaps legacy nginx and cert paths", () => {
  const machineRootDir = path.join("/tmp", "example", ".tmp", "local-edge");

  assert.equal(
    LocalEdgeCore_normalizeLegacyArtifactPath({
      configuredPath: path.join(
        machineRootDir,
        "generated",
        "nginx-docker",
        "main",
        "docker-compose.yml",
      ),
      machineRootDir,
      fallbackPath: path.join(machineRootDir, "fallback.yml"),
    }),
    path.join(machineRootDir, "router", "nginx-docker", "docker-compose.yml"),
  );

  assert.equal(
    LocalEdgeCore_normalizeLegacyArtifactPath({
      configuredPath: path.join(
        machineRootDir,
        "generated",
        "certs",
        "local-edge-cert.pem",
      ),
      machineRootDir,
      fallbackPath: path.join(machineRootDir, "fallback.pem"),
    }),
    path.join(machineRootDir, "certs", "local-edge-cert.pem"),
  );

  assert.equal(
    LocalEdgeCore_normalizeLegacyArtifactPath({
      configuredPath: path.join(
        machineRootDir,
        "generated",
        "certs",
        "nested",
        "local-edge-cert.pem",
      ),
      machineRootDir,
      fallbackPath: path.join(machineRootDir, "fallback.pem"),
    }),
    path.join(machineRootDir, "certs", "nested", "local-edge-cert.pem"),
  );
});

test("LocalEdgeCore TLS path helpers resolve default and legacy override paths", () => {
  const machineRootDir = path.join("/tmp", "example", ".tmp", "local-edge");

  assert.equal(
    LocalEdgeCore_resolveTlsCertPath({
      generatedDir: machineRootDir,
      rawCertPath: undefined,
    }),
    path.join(machineRootDir, "certs", "local-edge-cert.pem"),
  );
  assert.equal(
    LocalEdgeCore_resolveTlsKeyPath({
      generatedDir: machineRootDir,
      rawKeyPath: undefined,
    }),
    path.join(machineRootDir, "certs", "local-edge-key.pem"),
  );
  assert.equal(
    LocalEdgeCore_resolveTlsCertPath({
      generatedDir: machineRootDir,
      rawCertPath: path.join(
        "/old",
        "generated",
        "certs",
        "local-edge-cert.pem",
      ),
    }),
    path.join(machineRootDir, "certs", "local-edge-cert.pem"),
  );
});

test("LocalEdgeCore_resolveRealmArtifactPaths derives generic realm files", () => {
  const realmsDir = path.join(
    "/tmp",
    "example",
    ".tmp",
    "local-edge",
    "realms",
  );

  assert.deepEqual(
    LocalEdgeCore_resolveRealmArtifactPaths({
      realmsDir,
      realmSlug: "feature-a",
    }),
    {
      realmRootDir: path.join(realmsDir, "feature-a"),
      envDir: path.join(realmsDir, "feature-a", "env"),
      healthPath: path.join(realmsDir, "feature-a", "health.json"),
      metadataPath: path.join(realmsDir, "feature-a", "metadata.json"),
    },
  );
});

test("LocalEdgeCore env source path helpers default and de-duplicate active files", () => {
  assert.equal(
    LocalEdgeCore_defaultEnvFilePath({
      projectRoot: "/tmp/example",
      defaultEnvFileName: ".env.local-edge",
    }),
    path.join("/tmp/example", ".env.local-edge"),
  );
  assert.deepEqual(
    LocalEdgeCore_collectActiveEnvSourceFiles({
      projectRoot: "/tmp/example",
      defaultEnvFileName: ".env.local-edge",
      localEdgeRootEnvFile: "/tmp/example/.env.local-edge",
    }),
    ["/tmp/example/.env.local-edge"],
  );
  assert.deepEqual(
    LocalEdgeCore_collectActiveEnvSourceFiles({
      projectRoot: "/tmp/example",
      defaultEnvFileName: ".env.local-edge",
      localEdgeRootEnvFile: "/tmp/stack.env",
    }),
    ["/tmp/stack.env", "/tmp/example/.env.local-edge"],
  );
});
