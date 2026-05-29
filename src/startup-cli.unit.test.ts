/**
 * @fileoverview Verifies the local-edge startup CLI argv parsing, parsed-to-env projection, method
 * resolution, usage rendering, and implementation spawn-plan contracts in `startup-cli.ts`.
 *
 * This file owns regression coverage for `LocalEdgeStartupCli_*` helpers that bridge dispatcher argv
 * into `LOCAL_EDGE_STARTUP_CLI_*` env keys and stable `npx tsx` versus `bash` spawn plans.
 * Flow: parse subcommands -> assert parsed shapes -> apply env projection -> resolve method tokens ->
 * assert spawn argv, env keys, and deprecation warnings.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/startup-cli.unit.test.ts
 *
 * @see packages/local-edge-core/src/startup-cli.ts - Product-neutral startup dispatcher contract (parse, env bridge, method resolution, spawn planning) asserted by the cases in this module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract this header follows for verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_EDGE_STARTUP_EXIT_CODES,
  LocalEdgeStartupCliParseError,
  LocalEdgeStartupCli_applyParsedToEnv,
  LocalEdgeStartupCli_applyResolvedMethodToEnv,
  LocalEdgeStartupCli_buildImplSpawnPlan,
  LocalEdgeStartupCli_parseCommand,
  LocalEdgeStartupCli_parseDoctor,
  LocalEdgeStartupCli_parseEnsureRunning,
  LocalEdgeStartupCli_parseStart,
  LocalEdgeStartupCli_parseSetup,
  LocalEdgeStartupCli_renderUsage,
  LocalEdgeStartupCli_resolveImplBaseName,
  LocalEdgeStartupCli_resolveMethod,
} from "./startup-cli.js";

test("LocalEdgeStartupCli_parseDoctor preserves method and audit flags", () => {
  assert.deepEqual(
    LocalEdgeStartupCli_parseDoctor([
      "--method",
      "nginx-docker",
      "--strict",
      "--skip-application",
      "--watch-application",
      "--application-interval-ms",
      "1000",
      "--application-timeout-ms",
      "2000",
      "--application-max-wait-ms",
      "3000",
    ]),
    {
      command: "doctor",
      methodSource: "cli",
      method: "nginx-docker",
      strict: "true",
      skipApplication: true,
      watchApplication: true,
      applicationIntervalMs: "1000",
      applicationTimeoutMs: "2000",
      applicationMaxWaitMs: "3000",
    },
  );
});

test("LocalEdgeStartupCli_parseCommand forwards launch-runtime args", () => {
  assert.deepEqual(
    LocalEdgeStartupCli_parseCommand("launch-runtime", ["a", "b"]),
    {
      command: "launch-runtime",
      forwardedArgs: ["a", "b"],
    },
  );
});

test("LocalEdgeStartupCli_parseCommand rejects unknown commands with usage exit", () => {
  assert.throws(
    () => LocalEdgeStartupCli_parseCommand("unknown", []),
    (error: unknown) =>
      error instanceof LocalEdgeStartupCliParseError &&
      error.exitCode === LOCAL_EDGE_STARTUP_EXIT_CODES.usageError &&
      error.message === "[local-edge:startup-cli] Unknown command: unknown",
  );
});

test("LocalEdgeStartupCli_applyParsedToEnv projects doctor env flags", () => {
  const env = LocalEdgeStartupCli_applyParsedToEnv({
    command: "doctor",
    methodSource: "cli",
    method: "nginx-docker",
    strict: "false",
    skipRender: true,
    skipSetup: true,
    skipDns: true,
    skipEdge: true,
    skipApplication: true,
    watchApplication: true,
    applicationIntervalMs: "1000",
    applicationTimeoutMs: "2000",
    applicationMaxWaitMs: "3000",
  });

  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ACTIVE, "1");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_METHOD_USE_PRIMARY, "0");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_METHOD, "nginx-docker");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_STRICT, "false");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_RENDER, "1");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_SKIP_APPLICATION, "1");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_DOCTOR_WATCH_APPLICATION, "1");
});

test("LocalEdgeStartupCli_applyParsedToEnv projects ensure-running realm flags", () => {
  const env = LocalEdgeStartupCli_applyParsedToEnv(
    LocalEdgeStartupCli_parseEnsureRunning([
      "--method",
      "nginx-docker",
      "--realm",
      "main",
      "--recreate-if-running",
    ]),
  );

  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD_USE_PRIMARY, "0");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ENSURE_METHOD, "nginx-docker");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ENSURE_REALM_WAS_SET, "1");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ENSURE_REALM_VALUE, "main");
  assert.equal(env.LOCAL_EDGE_STARTUP_CLI_ENSURE_RECREATE, "1");
});

test("LocalEdgeStartupCli_resolveMethod defaults and all-deprecation match startup policy", () => {
  assert.deepEqual(
    LocalEdgeStartupCli_resolveMethod({
      parsed: LocalEdgeStartupCli_parseStart([]),
      env: { LOCAL_EDGE_PRIMARY_METHOD: "nginx-docker" },
    }),
    {
      method: "nginx-docker",
      source: "primary",
      allDeprecationApplied: false,
    },
  );

  assert.deepEqual(
    LocalEdgeStartupCli_resolveMethod({
      parsed: LocalEdgeStartupCli_parseSetup(["--method", "all"]),
      env: { LOCAL_EDGE_PRIMARY_METHOD: "nginx-docker" },
    }),
    {
      method: "nginx-docker",
      source: "cli",
      allDeprecationApplied: true,
    },
  );
});

test("LocalEdgeStartupCli_applyResolvedMethodToEnv emits stable keys", () => {
  const env: Record<string, string> = {};
  LocalEdgeStartupCli_applyResolvedMethodToEnv(
    { method: "nginx-docker", source: "cli", allDeprecationApplied: true },
    env,
  );

  assert.deepEqual(env, {
    LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD: "nginx-docker",
    LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_SOURCE: "cli",
    LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_ALL_DEPRECATED: "1",
  });
});

test("LocalEdgeStartupCli_resolveImplBaseName maps commands to compatibility impl filenames", () => {
  assert.equal(
    LocalEdgeStartupCli_resolveImplBaseName("doctor"),
    "doctor-impl.ts",
  );
  assert.equal(
    LocalEdgeStartupCli_resolveImplBaseName("canonical-start"),
    "canonical-start.impl.sh",
  );
});

test("LocalEdgeStartupCli_renderUsage renders caller supplied invocation", () => {
  const usage = LocalEdgeStartupCli_renderUsage({ invocation: "local-edge" });
  assert.match(usage, /^Usage: local-edge run <command>/);
  assert.match(usage, /ensure-running/);
});

test("LocalEdgeStartupCli_buildImplSpawnPlan creates env and argv for TypeScript impls", () => {
  const plan = LocalEdgeStartupCli_buildImplSpawnPlan({
    implBaseName: "doctor-impl.ts",
    implPath: "/adapter/doctor-impl.ts",
    parsed: LocalEdgeStartupCli_parseDoctor(["--method", "nginx-docker"]),
    env: { LOCAL_EDGE_PRIMARY_METHOD: "nginx-docker", KEEP: "1" },
  });

  assert.equal(plan.spawnCommand, "npx");
  assert.deepEqual(plan.spawnArgv, ["tsx", "/adapter/doctor-impl.ts"]);
  assert.equal(plan.env.KEEP, "1");
  assert.equal(plan.env.LOCAL_EDGE_STARTUP_CLI_ACTIVE, "1");
  assert.equal(plan.env.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD, "nginx-docker");
  assert.equal(plan.deprecationWarningLine, null);
});

test("LocalEdgeStartupCli_buildImplSpawnPlan creates shell plans and all deprecation warnings", () => {
  const plan = LocalEdgeStartupCli_buildImplSpawnPlan({
    implBaseName: "canonical-start.impl.sh",
    implPath: "/adapter/canonical-start.impl.sh",
    parsed: LocalEdgeStartupCli_parseSetup(["--method", "all"]),
    env: { LOCAL_EDGE_PRIMARY_METHOD: "nginx-docker" },
    extraArgs: ["--extra"],
  });

  assert.equal(plan.spawnCommand, "bash");
  assert.deepEqual(plan.spawnArgv, [
    "/adapter/canonical-start.impl.sh",
    "--extra",
  ]);
  assert.equal(plan.env.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD, "nginx-docker");
  assert.equal(
    plan.env.LOCAL_EDGE_STARTUP_CLI_RESOLVED_METHOD_ALL_DEPRECATED,
    "1",
  );
  assert.equal(
    plan.deprecationWarningLine,
    "[local-edge:setup] WARNING: --method all is deprecated in single-method mode. Using primary method 'nginx-docker'.",
  );
});
