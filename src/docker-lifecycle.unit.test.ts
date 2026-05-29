/**
 * @fileoverview Verifies Docker Compose argv builders, Docker stdout parsers, injectable lifecycle
 * predicates, mount-expectation helpers, shell command planners, and runtime polling for
 * `local-edge-core` Docker orchestration without a live daemon.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` exports from
 * `docker-lifecycle.js`, using fake `runDockerCommand` implementations to assert argument shapes,
 * parse trimming, probe sequencing, mount-source maps, and `waitForRuntimeReady` timing without
 * shelling out.
 * Flow: stub `runDockerCommand` or build options -> invoke builders or predicates -> assert argv
 * lists, parsed values, recorded invocation order, mount comparisons, or poll counts.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/docker-lifecycle.unit.test.ts
 *
 * @see packages/local-edge-core/src/docker-lifecycle.ts - Pure Docker and shell lifecycle planners, parsers, and injectable-runner predicates whose stable contracts are asserted here without real container I/O.
 * @see packages/local-edge-kit/src/docker-host.ts - Kit host adapter that supplies a real Docker runner and compose paths into the lifecycle helpers verified by this suite during local-edge bring-up.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildBashCommandPlan,
  LocalEdgeCore_buildDockerComposePsArgs,
  LocalEdgeCore_buildDockerComposeDownCommand,
  LocalEdgeCore_buildDockerComposeUpDetachedCommand,
  LocalEdgeCore_buildDockerExecNginxReloadArgs,
  LocalEdgeCore_buildDockerInfoArgs,
  LocalEdgeCore_buildDockerInspectRunningFormatArgs,
  LocalEdgeCore_buildDockerMountSourceInspectArgs,
  LocalEdgeCore_buildMethodLogFilePath,
  LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts,
  LocalEdgeCore_buildNohupBashCommandPlan,
  LocalEdgeCore_dockerLifecycleContainerId,
  LocalEdgeCore_dockerLifecycleContainerRunning,
  LocalEdgeCore_dockerLifecycleDaemonReady,
  LocalEdgeCore_dockerLifecycleMountSourceForDestination,
  LocalEdgeCore_dockerLifecycleReloadNginxContainer,
  LocalEdgeCore_extractShellCommandBinary,
  LocalEdgeCore_isCustomLoopbackHost,
  LocalEdgeCore_mountSourcesMatch,
  LocalEdgeCore_nginxDockerRuntimeMatchesArtifacts,
  LocalEdgeCore_parseDockerComposePsContainerId,
  LocalEdgeCore_parseDockerMountSource,
  LocalEdgeCore_parseDockerRunningState,
  LocalEdgeCore_parseDockerWaitPolicy,
  LocalEdgeCore_resolveDockerDesktopAppPath,
  LocalEdgeCore_waitForRuntimeReady,
} from "./docker-lifecycle.js";

import type {
  LocalEdgeCore_DockerLifecycleCommandInvocation,
  LocalEdgeCore_DockerLifecycleCommandResult,
  LocalEdgeCore_DockerLifecycleCommandRunner,
} from "./docker-lifecycle.js";

test("LocalEdgeCore Docker command builders render lifecycle args", () => {
  assert.deepEqual(LocalEdgeCore_buildDockerInfoArgs(), ["info"]);
  assert.deepEqual(
    LocalEdgeCore_buildDockerComposePsArgs({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
    }),
    ["compose", "-p", "demo", "-f", "/tmp/docker-compose.yml", "ps", "-q"],
  );
  assert.deepEqual(
    LocalEdgeCore_buildDockerComposePsArgs({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      serviceName: "router",
    }),
    [
      "compose",
      "-p",
      "demo",
      "-f",
      "/tmp/docker-compose.yml",
      "ps",
      "-q",
      "router",
    ],
  );
  assert.deepEqual(LocalEdgeCore_buildDockerInspectRunningFormatArgs("abc"), [
    "inspect",
    "--format",
    "{{.State.Running}}",
    "abc",
  ]);
  assert.deepEqual(LocalEdgeCore_buildDockerExecNginxReloadArgs("abc"), [
    "exec",
    "abc",
    "nginx",
    "-s",
    "reload",
  ]);
});

test("LocalEdgeCore Docker parsers preserve legacy trim semantics", () => {
  assert.equal(LocalEdgeCore_parseDockerComposePsContainerId("\nabc\n"), "abc");
  assert.equal(LocalEdgeCore_parseDockerComposePsContainerId("\n"), null);
  assert.equal(LocalEdgeCore_parseDockerRunningState("true\n"), true);
  assert.equal(LocalEdgeCore_parseDockerRunningState("false\n"), false);
  assert.equal(
    LocalEdgeCore_parseDockerMountSource(" /tmp/source \n"),
    "/tmp/source",
  );
});

test("LocalEdgeCore Docker lifecycle runners sequence daemon/container/reload probes", () => {
  const calls: LocalEdgeCore_DockerLifecycleCommandInvocation[] = [];

  /** Fake Docker runner that records command plans and returns happy-path outputs. */
  const runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner = (invocation) => {
    calls.push(invocation);
    const firstArg = invocation.args[0] ?? "";
    if (firstArg === "info") {
      return { status: 0, stdout: null };
    }
    if (firstArg === "compose") {
      return { status: 0, stdout: "\ncontainer-1\n" };
    }
    if (firstArg === "inspect") {
      return { status: 0, stdout: "true\n" };
    }
    if (firstArg === "exec") {
      return { status: 0, stdout: null };
    }
    const failed: LocalEdgeCore_DockerLifecycleCommandResult = {
      status: 1,
      stdout: null,
    };
    return failed;
  };

  assert.equal(LocalEdgeCore_dockerLifecycleDaemonReady({ runDockerCommand }), true);
  assert.equal(
    LocalEdgeCore_dockerLifecycleContainerId({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand,
    }),
    "container-1",
  );
  assert.equal(
    LocalEdgeCore_dockerLifecycleContainerRunning({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand,
    }),
    true,
  );
  assert.equal(
    LocalEdgeCore_dockerLifecycleReloadNginxContainer({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand,
    }),
    true,
  );

  assert.deepEqual(
    calls.map((call) => ({ mode: call.mode, args: call.args })),
    [
      { mode: "ignore", args: ["info"] },
      {
        mode: "pipe-stdout",
        args: ["compose", "-p", "demo", "-f", "/tmp/docker-compose.yml", "ps", "-q"],
      },
      {
        mode: "pipe-stdout",
        args: ["compose", "-p", "demo", "-f", "/tmp/docker-compose.yml", "ps", "-q"],
      },
      { mode: "pipe-stdout", args: ["inspect", "--format", "{{.State.Running}}", "container-1"] },
      {
        mode: "pipe-stdout",
        args: ["compose", "-p", "demo", "-f", "/tmp/docker-compose.yml", "ps", "-q"],
      },
      { mode: "ignore", args: ["exec", "container-1", "nginx", "-s", "reload"] },
    ],
  );
});

test("LocalEdgeCore Docker lifecycle runners preserve failed-probe fallbacks", () => {
  /** Fake Docker runner that simulates command failure for every invocation. */
  const failedRunner: LocalEdgeCore_DockerLifecycleCommandRunner = () => ({
    status: 1,
    stdout: null,
  });

  assert.equal(
    LocalEdgeCore_dockerLifecycleContainerId({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand: failedRunner,
    }),
    null,
  );
  assert.equal(
    LocalEdgeCore_dockerLifecycleContainerRunning({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand: failedRunner,
    }),
    false,
  );
  assert.equal(
    LocalEdgeCore_dockerLifecycleReloadNginxContainer({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
      runDockerCommand: failedRunner,
    }),
    false,
  );
});

test("LocalEdgeCore mount helpers compare container mounts", () => {
  const expectedMounts = [
    {
      destinationPath: "/etc/nginx/nginx.conf",
      expectedSourcePath: "/tmp/nginx.conf",
    },
    {
      destinationPath: "/etc/nginx/certs/local-edge-cert.pem",
      expectedSourcePath: "/tmp/cert.pem",
    },
  ];
  const matchingSources = new Map([
    ["/etc/nginx/nginx.conf", "/tmp/nginx.conf"],
    ["/etc/nginx/certs/local-edge-cert.pem", "/tmp/cert.pem"],
  ]);
  const mismatchingSources = new Map([
    ["/etc/nginx/nginx.conf", "/tmp/other.conf"],
    ["/etc/nginx/certs/local-edge-cert.pem", "/tmp/cert.pem"],
  ]);

  assert.deepEqual(
    LocalEdgeCore_buildDockerMountSourceInspectArgs({
      containerId: "abc",
      destinationPath: "/etc/nginx/nginx.conf",
    }),
    [
      "inspect",
      "--format",
      '{{range .Mounts}}{{if eq .Destination "/etc/nginx/nginx.conf"}}{{.Source}}{{end}}{{end}}',
      "abc",
    ],
  );
  assert.equal(
    LocalEdgeCore_mountSourcesMatch({
      expectedMounts,
      actualSourceByDestination: matchingSources,
    }),
    true,
  );
  assert.equal(
    LocalEdgeCore_mountSourcesMatch({
      expectedMounts,
      actualSourceByDestination: mismatchingSources,
    }),
    false,
  );
  assert.deepEqual(
    LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts({
      expectedNginxConfPath: "/tmp/nginx.conf",
      expectedCertPath: "/tmp/cert.pem",
      expectedKeyPath: "/tmp/key.pem",
    }),
    [
      {
        destinationPath: "/etc/nginx/nginx.conf",
        expectedSourcePath: "/tmp/nginx.conf",
      },
      {
        destinationPath: "/etc/nginx/certs/local-edge-cert.pem",
        expectedSourcePath: "/tmp/cert.pem",
      },
      {
        destinationPath: "/etc/nginx/certs/local-edge-key.pem",
        expectedSourcePath: "/tmp/key.pem",
      },
    ],
  );
});

test("LocalEdgeCore mount helpers inspect sources and compare runtime artifacts", () => {
  /** Fake Docker runner that returns a mount source only for the nginx config destination. */
  const runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner = (invocation) => {
    const destinationPath = String(invocation.args[2] ?? "");
    if (destinationPath.includes("/etc/nginx/nginx.conf")) {
      return { status: 0, stdout: "/tmp/nginx.conf\n" };
    }
    return { status: 1, stdout: null };
  };

  assert.equal(
    LocalEdgeCore_dockerLifecycleMountSourceForDestination({
      containerId: "container-1",
      destinationPath: "/etc/nginx/nginx.conf",
      runDockerCommand,
    }),
    "/tmp/nginx.conf",
  );
  assert.equal(
    LocalEdgeCore_nginxDockerRuntimeMatchesArtifacts({
      containerId: "container-1",
      expectedNginxConfPath: "/tmp/nginx.conf",
      expectedCertPath: "/tmp/cert.pem",
      expectedKeyPath: "/tmp/key.pem",
      /** Resolves expected container destinations to host artifact paths. */
      resolveMountSource({ destinationPath }) {
        return new Map([
          ["/etc/nginx/nginx.conf", "/tmp/nginx.conf"],
          ["/etc/nginx/certs/local-edge-cert.pem", "/tmp/cert.pem"],
          ["/etc/nginx/certs/local-edge-key.pem", "/tmp/key.pem"],
        ]).get(destinationPath) ?? "";
      },
    }),
    true,
  );
});

test("LocalEdgeCore host and shell command planners resolve legacy values", () => {
  assert.equal(
    LocalEdgeCore_resolveDockerDesktopAppPath({
      homeDir: "/Users/demo",
      pathExists: (candidatePath) =>
        candidatePath === "/Users/demo/Applications/Docker.app",
    }),
    "/Users/demo/Applications/Docker.app",
  );
  assert.deepEqual(
    LocalEdgeCore_parseDockerWaitPolicy({
      timeoutSecondsRaw: "30",
      intervalSecondsRaw: "5",
    }),
    { timeoutSeconds: 30, intervalMs: 5000 },
  );
  assert.equal(
    LocalEdgeCore_buildMethodLogFilePath({
      logDir: "/tmp/logs",
      method: "nginx-docker",
    }),
    "/tmp/logs/nginx-docker.log",
  );
  assert.deepEqual(LocalEdgeCore_buildNohupBashCommandPlan("npm run local"), {
    command: "nohup",
    args: ["bash", "-lc", "npm run local"],
  });
  assert.deepEqual(LocalEdgeCore_buildBashCommandPlan("docker compose down"), {
    command: "bash",
    args: ["-lc", "docker compose down"],
  });
  assert.equal(
    LocalEdgeCore_extractShellCommandBinary('  "docker" compose up -d'),
    "docker",
  );
  assert.equal(
    LocalEdgeCore_buildDockerComposeUpDetachedCommand({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
    }),
    'docker compose -p "demo" -f "/tmp/docker-compose.yml" up -d',
  );
  assert.equal(
    LocalEdgeCore_buildDockerComposeDownCommand({
      projectName: "demo",
      composePath: "/tmp/docker-compose.yml",
    }),
    'docker compose -p "demo" -f "/tmp/docker-compose.yml" down',
  );
  assert.equal(LocalEdgeCore_isCustomLoopbackHost("127.0.0.3"), true);
  assert.equal(LocalEdgeCore_isCustomLoopbackHost("127.0.0.1"), false);
});

test("LocalEdgeCore_waitForRuntimeReady polls until success and performs final check", () => {
  let now = 0;
  let checks = 0;
  let sleeps = 0;

  assert.equal(
    LocalEdgeCore_waitForRuntimeReady({
      timeoutSeconds: 3,
      nowMs: () => now,
      isRunning: () => {
        checks += 1;
        return checks === 3;
      },
      sleep: () => {
        sleeps += 1;
        now += 1000;
      },
    }),
    true,
  );
  assert.equal(sleeps, 2);

  now = 0;
  assert.equal(
    LocalEdgeCore_waitForRuntimeReady({
      timeoutSeconds: 0,
      nowMs: () => now,
      isRunning: () => true,
      sleep: () => {
        throw new Error("sleep should not run");
      },
    }),
    true,
  );
});
