/**
 * @fileoverview Verifies the plan-only services backend and the backend registry: plans are
 * printed with what they need, and `apply()` always refuses.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-plan-only.unit.test.ts
 *
 * @see src/exposure-plan-only.ts - Backends under test.
 * @see src/exposure-backends.ts - Registry under test.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { LocalEdgeCore_ExposureManifest } from "./exposure.js";
import {
  LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND,
  LocalEdgeCore_createExposureBackend,
  LocalEdgeCore_isExposureBackendName,
} from "./exposure-backends.js";

const manifest: LocalEdgeCore_ExposureManifest = {
  protectedPorts: [443],
  rootZone: "dev.example.test",
  apps: [
    { id: "auth", enabled: true, localPort: 4300, edgePort: 8451 },
    { id: "later", enabled: false, localPort: 3300 },
  ],
};

void test("tailscale-services plans svc:<name> steps that need a tailnet admin", () => {
  const backend = LocalEdgeCore_createExposureBackend("tailscale-services");
  const plan = backend.plan(manifest);
  assert.equal(plan.applicable, false);
  assert.equal(plan.actions[0]?.kind, "manual");
  assert.equal(plan.actions[0]?.requires, "tailnet-admin");
  assert.deepEqual(plan.actions[0]?.argv, ["tailscale", "serve", "--service=svc:auth", "--https=443", "http://127.0.0.1:4300"]);
  assert.equal(plan.actions[1]?.kind, "skip");
  const result = backend.apply(plan, { apply: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /plan-only/);
  assert.equal(backend.remove(manifest, { apply: true }).ok, false);
});

void test("registry defaults to tailscale-serve-ports and rejects unknown names", () => {
  assert.equal(LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND, "tailscale-serve-ports");
  assert.equal(LocalEdgeCore_isExposureBackendName("tailscale-serve-ports"), true);
  assert.equal(LocalEdgeCore_isExposureBackendName("serve-funnel"), false);
  assert.throws(() => LocalEdgeCore_createExposureBackend("serve-funnel"), /unknown exposure backend/);
  assert.equal(LocalEdgeCore_createExposureBackend("ports").name, "tailscale-serve-ports");
  assert.equal(LocalEdgeCore_createExposureBackend("hostnames").name, "hostnames");
  assert.equal(LocalEdgeCore_createExposureBackend("wildcard-dns-nginx").name, "hostnames");
});
