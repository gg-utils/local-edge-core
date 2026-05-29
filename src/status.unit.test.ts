/**
 * @fileoverview Verifies local-edge status helpers for Docker compose probe argv plans, container id
 * and inspect parsing, injected-runner probe sequencing, status report text/JSON rendering, and
 * legacy status CLI argv parsing.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` exports from `status.js`,
 * keeping deterministic status output and probe orchestration contracts stable for kit callers.
 * Flow: build options or mock `runDockerCommand` -> invoke builders/parsers/probes/renderers ->
 * assert argv lists, parsed ids, running booleans, rendered lines, or parsed JSON payloads.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/status.unit.test.ts
 *
 * @see packages/local-edge-core/src/status.ts - Core status primitives under test for argv parsing, Docker probe plans, report assembly, and text or JSON rendering asserted here.
 * @see packages/local-edge-kit/src/status-cli.ts - Kit status subcommand that loads runtime config, runs probes, then calls the report builders and renderers exercised by this test module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_parseStatusCliArgs,
  LocalEdgeCore_buildDockerComposeServiceContainerIdArgs,
  LocalEdgeCore_buildDockerInspectRunningArgs,
  LocalEdgeCore_buildStatusReport,
  LocalEdgeCore_parseDockerComposeContainerId,
  LocalEdgeCore_parseDockerInspectRunningState,
  LocalEdgeCore_probeDockerComposeServiceRunning,
  LocalEdgeCore_renderStatusJson,
  LocalEdgeCore_renderStatusText,
} from "./status.js";

test("LocalEdgeCore_buildDockerComposeServiceContainerIdArgs renders compose ps args", () => {
  assert.deepEqual(
    LocalEdgeCore_buildDockerComposeServiceContainerIdArgs({
      projectName: "local-edge-nginx-docker-demo",
      composePath: "/tmp/docker-compose.yml",
      serviceName: "local-edge-nginx-docker",
    }),
    [
      "compose",
      "-p",
      "local-edge-nginx-docker-demo",
      "-f",
      "/tmp/docker-compose.yml",
      "ps",
      "-q",
      "local-edge-nginx-docker",
    ],
  );
});

test("LocalEdgeCore Docker parsers normalize command output", () => {
  assert.equal(
    LocalEdgeCore_parseDockerComposeContainerId("\nabc123\ndef456\n"),
    "abc123",
  );
  assert.equal(LocalEdgeCore_parseDockerComposeContainerId("\n"), null);
  assert.equal(LocalEdgeCore_parseDockerInspectRunningState("true\n"), true);
  assert.equal(LocalEdgeCore_parseDockerInspectRunningState("false\n"), false);
  assert.deepEqual(LocalEdgeCore_buildDockerInspectRunningArgs("abc123"), [
    "inspect",
    "-f",
    "{{.State.Running}}",
    "abc123",
  ]);
});

test("LocalEdgeCore_probeDockerComposeServiceRunning sequences compose and inspect probes", () => {
  const calls: string[][] = [];

  assert.equal(
    LocalEdgeCore_probeDockerComposeServiceRunning({
      projectName: "local-edge-nginx-docker-demo",
      composePath: "/tmp/docker-compose.yml",
      serviceName: "local-edge-nginx-docker",
      /** Records command plans and returns compose/inspect output for the happy path. */
      runDockerCommand(args) {
        calls.push([...args]);
        if (args[0] === "compose") {
          return "\nabc123\n";
        }
        return "true\n";
      },
    }),
    true,
  );

  assert.deepEqual(calls, [
    [
      "compose",
      "-p",
      "local-edge-nginx-docker-demo",
      "-f",
      "/tmp/docker-compose.yml",
      "ps",
      "-q",
      "local-edge-nginx-docker",
    ],
    ["inspect", "-f", "{{.State.Running}}", "abc123"],
  ]);
});

test("LocalEdgeCore_probeDockerComposeServiceRunning treats absent or failed probes as stopped", () => {
  assert.equal(
    LocalEdgeCore_probeDockerComposeServiceRunning({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      serviceName: "router",
      /** Simulates Docker Compose returning no container id. */
      runDockerCommand() {
        return "\n";
      },
    }),
    false,
  );

  assert.equal(
    LocalEdgeCore_probeDockerComposeServiceRunning({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      serviceName: "router",
      /** Simulates a failed Docker invocation. */
      runDockerCommand() {
        throw new Error("docker unavailable");
      },
    }),
    false,
  );
});

test("LocalEdgeCore status report renders legacy text output", () => {
  const report = LocalEdgeCore_buildStatusReport({
    selectedMethod: "nginx-docker",
    configuredMethods: ["nginx-docker"],
    methodStatuses: [
      {
        method: "nginx-docker",
        host: "127.0.0.1",
        port: 443,
        running: true,
      },
    ],
  });

  assert.equal(
    LocalEdgeCore_renderStatusText(report),
    `[local-edge:status] nginx-docker  bind=127.0.0.1:443 running=true
[local-edge:status] allRunning=true`,
  );
});

test("LocalEdgeCore status report renders all-method text and legacy JSON", () => {
  const report = LocalEdgeCore_buildStatusReport({
    selectedMethod: "all",
    configuredMethods: ["nginx-docker"],
    methodStatuses: [
      {
        method: "nginx-docker",
        host: "127.0.0.1",
        port: 443,
        running: false,
      },
    ],
  });

  assert.equal(
    LocalEdgeCore_renderStatusText(report),
    `[local-edge:status] configuredMethods=nginx-docker
[local-edge:status] nginx-docker  bind=127.0.0.1:443 running=false
[local-edge:status] allRunning=false`,
  );
  assert.deepEqual(JSON.parse(LocalEdgeCore_renderStatusJson(report)), {
    method: "all",
    configuredMethods: "nginx-docker",
    selected: { method: "all", port: 0, running: false },
    nginxDocker: { running: false, host: "127.0.0.1", port: 443 },
    allRunning: false,
  });
});

test("LocalEdgeCore status CLI parser preserves legacy status flags", () => {
  assert.deepEqual(
    LocalEdgeCore_parseStatusCliArgs({
      args: ["--json", "--require-all", "--require-running", "--method", "all"],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:status",
    }),
    {
      method: "all",
      outputMode: "json",
      requireAll: true,
      requireRunning: true,
    },
  );

  assert.deepEqual(
    LocalEdgeCore_parseStatusCliArgs({
      args: [],
      defaultMethod: "nginx-docker",
      supportedMethods: ["nginx-docker"],
      commandLabel: "local-edge:status",
    }),
    {
      method: "nginx-docker",
      outputMode: "text",
      requireAll: false,
      requireRunning: false,
    },
  );

  assert.throws(
    () =>
      LocalEdgeCore_parseStatusCliArgs({
        args: ["--unknown"],
        defaultMethod: "nginx-docker",
        supportedMethods: ["nginx-docker"],
        commandLabel: "local-edge:status",
      }),
    /\[local-edge:status\] Unknown option: --unknown/,
  );
});
