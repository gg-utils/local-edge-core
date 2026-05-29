/**
 * @fileoverview Verifies pure `LocalEdgeCore_*` healthcheck helpers for probe keys, fingerprints,
 * per-cycle rollups, status-path construction, HTTP success classification, failure-domain mapping,
 * fingerprint stability ticks, summary-log cadence, strict-watch exit rules, and argv/env parsing
 * with validation errors.
 *
 * This file owns Node test regression coverage for the exports from `healthcheck.js`, keeping
 * deterministic health math and CLI parse rules aligned with kit runners without exercising HTTP
 * or filesystem I/O here.
 * Flow: build representative probe rows, argv slices, or option bags -> invoke helpers -> assert
 * strings, counts, booleans, or thrown parse errors.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/healthcheck.unit.test.ts
 *
 * @see packages/local-edge-core/src/healthcheck.ts - Pure healthcheck contract under test whose probe math, fingerprinting, and argv parsing behavior is asserted in this module.
 * @see packages/local-edge-kit/src/healthcheck-cli.ts - Kit healthcheck command surface that composes HTTPS probes and registry reads with the helpers verified here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildHealthcheckRequestPath,
  LocalEdgeCore_classifyHealthcheckErrorDomain,
  LocalEdgeCore_parseHealthcheckRuntimeOptions,
  LocalEdgeCore_computeHealthFingerprint,
  LocalEdgeCore_computeHealthProbeRollups,
  LocalEdgeCore_healthProbeKey,
  LocalEdgeCore_isHealthyHttpStatusCode,
  LocalEdgeCore_shouldFailStrictHealthWatch,
  LocalEdgeCore_shouldLogHealthSummary,
  LocalEdgeCore_tickHealthFingerprintStability,
} from "./healthcheck.js";

test("LocalEdgeCore healthcheck helpers build stable probe keys and fingerprints", () => {
  assert.equal(
    LocalEdgeCore_healthProbeKey({
      realmSlug: "main",
      method: "nginx-docker",
      surface: "www",
    }),
    "main::nginx-docker::www",
  );

  assert.equal(
    LocalEdgeCore_computeHealthFingerprint([
      {
        realmSlug: "main",
        method: "nginx-docker",
        surface: "manager-next",
        healthy: false,
      },
      {
        realmSlug: "main",
        method: "nginx-docker",
        surface: "www",
        healthy: true,
      },
    ]),
    "main::nginx-docker::manager-next:0|main::nginx-docker::www:1",
  );
});

test("LocalEdgeCore healthcheck helpers compute probe rollups", () => {
  assert.deepEqual(
    LocalEdgeCore_computeHealthProbeRollups([
      { healthy: true, failureDomain: "none" },
      { healthy: false, failureDomain: "application" },
      { healthy: false, failureDomain: "router" },
    ]),
    {
      failedProbeCount: 2,
      applicationFailedProbeCount: 1,
      routerFailedProbeCount: 1,
      healthyProbeCount: 1,
    },
  );
});

test("LocalEdgeCore healthcheck helpers build request paths and classify HTTP results", () => {
  assert.equal(
    LocalEdgeCore_buildHealthcheckRequestPath({
      statusPath: "/status",
      surface: "app",
      method: "nginx-docker",
      commandLabel: "local-edge:healthcheck",
    }),
    "/status?le_probe=1&le_surface=app&le_method=nginx-docker",
  );
  assert.equal(
    LocalEdgeCore_buildHealthcheckRequestPath({
      statusPath: "/status?ready=1",
      surface: "app",
      method: "nginx-docker",
      commandLabel: "local-edge:healthcheck",
    }),
    "/status?ready=1&le_probe=1&le_surface=app&le_method=nginx-docker",
  );
  assert.equal(LocalEdgeCore_isHealthyHttpStatusCode(204), true);
  assert.equal(LocalEdgeCore_isHealthyHttpStatusCode(404), false);
  assert.equal(
    LocalEdgeCore_classifyHealthcheckErrorDomain("ECONNREFUSED 127.0.0.1"),
    "router",
  );
  assert.equal(
    LocalEdgeCore_classifyHealthcheckErrorDomain("unexpected payload"),
    "application",
  );
});

test("LocalEdgeCore healthcheck helpers track fingerprint stability", () => {
  assert.deepEqual(
    LocalEdgeCore_tickHealthFingerprintStability({
      currentHealthFingerprint: "a:1|b:0",
      previousHealthFingerprint: null,
      consecutiveStableCycles: 0,
    }),
    {
      consecutiveStableCycles: 1,
      previousHealthFingerprint: "a:1|b:0",
    },
  );

  assert.deepEqual(
    LocalEdgeCore_tickHealthFingerprintStability({
      currentHealthFingerprint: "a:1|b:0",
      previousHealthFingerprint: "a:1|b:0",
      consecutiveStableCycles: 2,
    }),
    {
      consecutiveStableCycles: 3,
      previousHealthFingerprint: "a:1|b:0",
    },
  );
});

test("LocalEdgeCore healthcheck helpers decide summary logging cadence", () => {
  const base = {
    hasAnyUnhealthy: false,
    isFirstCycle: false,
    isHeartbeat: false,
    isVerbose: false,
    summaryChanged: false,
    watch: true,
  };

  assert.equal(LocalEdgeCore_shouldLogHealthSummary(base), false);
  assert.equal(
    LocalEdgeCore_shouldLogHealthSummary({ ...base, isFirstCycle: true }),
    true,
  );
  assert.equal(
    LocalEdgeCore_shouldLogHealthSummary({ ...base, hasAnyUnhealthy: true }),
    true,
  );
  assert.equal(
    LocalEdgeCore_shouldLogHealthSummary({ ...base, watch: false }),
    true,
  );
});

test("LocalEdgeCore healthcheck helpers fail only exhausted strict watch runs", () => {
  const base = {
    failedProbeCount: 1,
    maxWaitMs: 1000,
    strict: true,
    untilHealthy: true,
    watch: true,
  };

  assert.equal(LocalEdgeCore_shouldFailStrictHealthWatch(base), true);
  assert.equal(
    LocalEdgeCore_shouldFailStrictHealthWatch({ ...base, failedProbeCount: 0 }),
    false,
  );
  assert.equal(
    LocalEdgeCore_shouldFailStrictHealthWatch({ ...base, strict: false }),
    false,
  );
  assert.equal(
    LocalEdgeCore_shouldFailStrictHealthWatch({ ...base, maxWaitMs: null }),
    false,
  );
});

test("LocalEdgeCore healthcheck parser resolves defaults and env verbosity", () => {
  assert.deepEqual(
    LocalEdgeCore_parseHealthcheckRuntimeOptions({
      args: [],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      strictStartValue: "1",
      healthcheckLogVerbosityValue: "all",
      commandLabel: "local-edge:healthcheck",
      defaultIntervalMs: 5000,
      defaultSteadyIntervalMs: 15000,
      defaultTimeoutMs: 5000,
    }),
    {
      options: {
        requestedMethod: "nginx-docker",
        requestedRealmSlug: null,
        includeInactive: false,
        strict: true,
        watch: false,
        intervalMs: 5000,
        steadyIntervalMs: 15000,
        timeoutMs: 5000,
        untilHealthy: false,
        maxWaitMs: null,
        logVerbosity: "all",
        logVerbositySource: "env",
      },
      warnings: [],
    },
  );
});

test("LocalEdgeCore healthcheck parser preserves watch flags and deprecated method warning", () => {
  assert.deepEqual(
    LocalEdgeCore_parseHealthcheckRuntimeOptions({
      args: [
        "--method",
        "all",
        "--realm",
        "feature-a",
        "--include-inactive",
        "--watch",
        "--until-healthy",
        "--interval-ms",
        "10",
        "--steady-interval-ms",
        "20",
        "--timeout-ms",
        "30",
        "--max-wait-ms",
        "40",
        "--healthcheck-log-verbosity",
        "all",
      ],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      strictStartValue: undefined,
      healthcheckLogVerbosityValue: undefined,
      commandLabel: "local-edge:healthcheck",
      defaultIntervalMs: 5000,
      defaultSteadyIntervalMs: 15000,
      defaultTimeoutMs: 5000,
    }),
    {
      options: {
        requestedMethod: "nginx-docker",
        requestedRealmSlug: "feature-a",
        includeInactive: true,
        strict: false,
        watch: true,
        intervalMs: 10,
        steadyIntervalMs: 20,
        timeoutMs: 30,
        untilHealthy: true,
        maxWaitMs: 40,
        logVerbosity: "all",
        logVerbositySource: "cli",
      },
      warnings: [
        "[local-edge:healthcheck] WARNING: --method all is deprecated in single-method mode. Using 'nginx-docker'.",
      ],
    },
  );
});

test("LocalEdgeCore healthcheck parser rejects invalid flag combinations", () => {
  assert.throws(
    () =>
      LocalEdgeCore_parseHealthcheckRuntimeOptions({
        args: ["--max-wait-ms", "100"],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        strictStartValue: undefined,
        healthcheckLogVerbosityValue: undefined,
        commandLabel: "local-edge:healthcheck",
        defaultIntervalMs: 5000,
        defaultSteadyIntervalMs: 15000,
        defaultTimeoutMs: 5000,
      }),
    /\[local-edge:healthcheck\] --max-wait-ms requires --watch\./,
  );

  assert.throws(
    () =>
      LocalEdgeCore_parseHealthcheckRuntimeOptions({
        args: ["--timeout-ms", "0"],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        strictStartValue: undefined,
        healthcheckLogVerbosityValue: undefined,
        commandLabel: "local-edge:healthcheck",
        defaultIntervalMs: 5000,
        defaultSteadyIntervalMs: 15000,
        defaultTimeoutMs: 5000,
      }),
    /\[local-edge:healthcheck\] --timeout-ms must be a positive integer\. Received '0'\./,
  );
});
