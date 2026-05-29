/**
 * @fileoverview Product-neutral Docker and shell lifecycle planning helpers for local-edge.
 *
 * This file owns pure argument builders, parse helpers, injectable-runner predicates, mount
 * expectations, Docker Desktop path resolution from host facts, wait-policy parsing, and nohup/bash
 * command plans. Callers supply `runDockerCommand`, filesystem probes, clocks, and sleep; this module
 * never shells out, opens Docker Desktop, or binds a specific repo layout beyond the passed strings.
 *
 * @example
 * ```typescript
 * import { LocalEdgeCore_dockerLifecycleDaemonReady } from "@gg-utils/local-edge-core/docker-lifecycle";
 *
 * LocalEdgeCore_dockerLifecycleDaemonReady({
 *   runDockerCommand: () => ({ status: 0, stdout: null }),
 * });
 * ```
 *
 * @testing Node test: npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-kit/src/docker-host.ts - Host adapter that injects a real Docker runner and compose paths into these builders and readiness predicates during local-edge bring-up.
 * @see packages/local-edge-core/src/docker-lifecycle.unit.test.ts - Node test suite that asserts argument lists and parsers stay stable without requiring a live Docker daemon.
 * @see packages/local-edge-core/src/router/nginx-docker.ts - Router surface that re-exports this module so nginx-docker orchestration shares the same lifecycle helpers.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

/** Filesystem existence probe used by Docker Desktop path planning. */
export type LocalEdgeCore_DockerPathExists = (path: string) => boolean;

/** Parsed wait policy for Docker daemon/runtime polling loops. */
export type LocalEdgeCore_DockerWaitPolicy = {
  timeoutSeconds: number;
  intervalMs: number;
};

/** Expected container mount source for one destination path. */
export type LocalEdgeCore_DockerExpectedMount = {
  destinationPath: string;
  expectedSourcePath: string;
};

/** Result of planning a shell command invocation. */
export type LocalEdgeCore_ShellCommandPlan = {
  command: string;
  args: readonly string[];
};

/** Host command invocation mode for Docker lifecycle probes. */
export type LocalEdgeCore_DockerLifecycleCommandMode = "ignore" | "pipe-stdout";

/** Host command invocation request for Docker lifecycle probes. */
export type LocalEdgeCore_DockerLifecycleCommandInvocation = {
  args: readonly string[];
  mode: LocalEdgeCore_DockerLifecycleCommandMode;
  timeoutMs: number;
};

/** Host command invocation result for Docker lifecycle probes. */
export type LocalEdgeCore_DockerLifecycleCommandResult = {
  status: number | null;
  stdout: string | null;
};

/** Injectable Docker command runner used by adapters that own Docker binary resolution. */
export type LocalEdgeCore_DockerLifecycleCommandRunner = (
  invocation: LocalEdgeCore_DockerLifecycleCommandInvocation,
) => LocalEdgeCore_DockerLifecycleCommandResult;

/** Injectable runtime polling predicate. */
export type LocalEdgeCore_RuntimeReadyPredicate = () => boolean;

/** Injectable sleep/wait operation for runtime polling loops. */
export type LocalEdgeCore_RuntimeWaitSleep = () => void;

/** Builds the `docker info` argument list used for daemon readiness checks. */
export function LocalEdgeCore_buildDockerInfoArgs(): string[] {
  return ["info"];
}

/** Builds a Docker Compose `ps -q` argument list, optionally scoped to one service. */
export function LocalEdgeCore_buildDockerComposePsArgs(options: {
  projectName: string;
  composePath: string;
  serviceName?: string;
}): string[] {
  const args = [
    "compose",
    "-p",
    options.projectName,
    "-f",
    options.composePath,
    "ps",
    "-q",
  ];
  if (options.serviceName && options.serviceName.length > 0) {
    args.push(options.serviceName);
  }
  return args;
}

/** Parses a Docker Compose `ps -q` result as the historical trimmed container id string. */
export function LocalEdgeCore_parseDockerComposePsContainerId(
  stdout: string,
): string | null {
  const containerId = stdout.trim();
  return containerId.length > 0 ? containerId : null;
}

/** Builds Docker inspect args for checking whether a container is running. */
export function LocalEdgeCore_buildDockerInspectRunningFormatArgs(
  containerId: string,
): string[] {
  return ["inspect", "--format", "{{.State.Running}}", containerId];
}

/** Parses Docker inspect running-state text. */
export function LocalEdgeCore_parseDockerRunningState(stdout: string): boolean {
  return stdout.trim() === "true";
}

/** Builds Docker exec args for reloading nginx inside a running container. */
export function LocalEdgeCore_buildDockerExecNginxReloadArgs(
  containerId: string,
): string[] {
  return ["exec", containerId, "nginx", "-s", "reload"];
}

/** Builds Docker inspect args for reading the source mounted at a destination path. */
export function LocalEdgeCore_buildDockerMountSourceInspectArgs(options: {
  containerId: string;
  destinationPath: string;
}): string[] {
  return [
    "inspect",
    "--format",
    `{{range .Mounts}}{{if eq .Destination "${options.destinationPath}"}}{{.Source}}{{end}}{{end}}`,
    options.containerId,
  ];
}

/** Parses a Docker inspect mount-source result. */
export function LocalEdgeCore_parseDockerMountSource(stdout: string): string {
  return stdout.trim();
}

/** Returns true when `docker info` succeeds through an adapter-owned Docker runner. */
export function LocalEdgeCore_dockerLifecycleDaemonReady(options: {
  runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean {
  const result = options.runDockerCommand({
    args: LocalEdgeCore_buildDockerInfoArgs(),
    mode: "ignore",
    timeoutMs: 10_000,
  });
  return result.status === 0;
}

/** Returns the Docker Compose container id for a project/config pair, or null. */
export function LocalEdgeCore_dockerLifecycleContainerId(options: {
  projectName: string;
  composePath: string;
  runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): string | null {
  const result = options.runDockerCommand({
    args: LocalEdgeCore_buildDockerComposePsArgs({
      projectName: options.projectName,
      composePath: options.composePath,
    }),
    mode: "pipe-stdout",
    timeoutMs: 10_000,
  });

  if (result.status !== 0 || result.stdout === null) {
    return null;
  }

  return LocalEdgeCore_parseDockerComposePsContainerId(result.stdout);
}

/** Returns true when a Compose container exists and Docker inspect reports it as running. */
export function LocalEdgeCore_dockerLifecycleContainerRunning(options: {
  projectName: string;
  composePath: string;
  runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean {
  const containerId = LocalEdgeCore_dockerLifecycleContainerId(options);
  if (containerId === null) {
    return false;
  }

  const result = options.runDockerCommand({
    args: LocalEdgeCore_buildDockerInspectRunningFormatArgs(containerId),
    mode: "pipe-stdout",
    timeoutMs: 10_000,
  });

  if (result.status !== 0 || result.stdout === null) {
    return false;
  }

  return LocalEdgeCore_parseDockerRunningState(result.stdout);
}

/** Reloads nginx in the running container via an adapter-owned Docker runner. */
export function LocalEdgeCore_dockerLifecycleReloadNginxContainer(options: {
  projectName: string;
  composePath: string;
  runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean {
  const containerId = LocalEdgeCore_dockerLifecycleContainerId(options);
  if (containerId === null) {
    return false;
  }

  const result = options.runDockerCommand({
    args: LocalEdgeCore_buildDockerExecNginxReloadArgs(containerId),
    mode: "ignore",
    timeoutMs: 10_000,
  });

  return result.status === 0;
}

/** Returns the source path mounted at `destinationPath`, or an empty string on probe failure. */
export function LocalEdgeCore_dockerLifecycleMountSourceForDestination(options: {
  containerId: string;
  destinationPath: string;
  runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): string {
  const result = options.runDockerCommand({
    args: LocalEdgeCore_buildDockerMountSourceInspectArgs({
      containerId: options.containerId,
      destinationPath: options.destinationPath,
    }),
    mode: "pipe-stdout",
    timeoutMs: 10_000,
  });

  if (result.status !== 0 || result.stdout === null) {
    return "";
  }

  return LocalEdgeCore_parseDockerMountSource(result.stdout);
}

/** Builds the expected nginx-docker bind mounts for generated runtime artifacts. */
export function LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts(options: {
  expectedNginxConfPath: string;
  expectedCertPath: string;
  expectedKeyPath: string;
}): LocalEdgeCore_DockerExpectedMount[] {
  return [
    {
      destinationPath: "/etc/nginx/nginx.conf",
      expectedSourcePath: options.expectedNginxConfPath,
    },
    {
      destinationPath: "/etc/nginx/certs/local-edge-cert.pem",
      expectedSourcePath: options.expectedCertPath,
    },
    {
      destinationPath: "/etc/nginx/certs/local-edge-key.pem",
      expectedSourcePath: options.expectedKeyPath,
    },
  ];
}

/** Compares expected nginx-docker artifact mounts against adapter-resolved mount sources. */
export function LocalEdgeCore_nginxDockerRuntimeMatchesArtifacts(options: {
  containerId: string;
  expectedNginxConfPath: string;
  expectedCertPath: string;
  expectedKeyPath: string;
  resolveMountSource: (options: {
    containerId: string;
    destinationPath: string;
  }) => string;
}): boolean {
  const expectedMounts = LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts(options);
  const actualSourceByDestination = new Map<string, string>();

  for (const expectedMount of expectedMounts) {
    actualSourceByDestination.set(
      expectedMount.destinationPath,
      options.resolveMountSource({
        containerId: options.containerId,
        destinationPath: expectedMount.destinationPath,
      }),
    );
  }

  return LocalEdgeCore_mountSourcesMatch({
    expectedMounts,
    actualSourceByDestination,
  });
}

/** Returns true when every expected mount destination resolves to the expected source path. */
export function LocalEdgeCore_mountSourcesMatch(options: {
  expectedMounts: readonly LocalEdgeCore_DockerExpectedMount[];
  actualSourceByDestination: ReadonlyMap<string, string>;
}): boolean {
  for (const expectedMount of options.expectedMounts) {
    if (
      options.actualSourceByDestination.get(expectedMount.destinationPath) !==
      expectedMount.expectedSourcePath
    ) {
      return false;
    }
  }
  return true;
}

/** Resolves a Docker Desktop `.app` path from explicit host facts. */
export function LocalEdgeCore_resolveDockerDesktopAppPath(options: {
  homeDir: string;
  pathExists: LocalEdgeCore_DockerPathExists;
}): string | null {
  if (options.pathExists("/Applications/Docker.app")) {
    return "/Applications/Docker.app";
  }
  if (
    options.homeDir.length > 0 &&
    options.pathExists(`${options.homeDir}/Applications/Docker.app`)
  ) {
    return `${options.homeDir}/Applications/Docker.app`;
  }
  return null;
}

/** Parses Docker wait timeout/interval environment values with legacy defaults. */
export function LocalEdgeCore_parseDockerWaitPolicy(options: {
  timeoutSecondsRaw: string | undefined;
  intervalSecondsRaw: string | undefined;
}): LocalEdgeCore_DockerWaitPolicy {
  const timeoutSeconds = Number.parseInt(
    options.timeoutSecondsRaw ?? "120",
    10,
  );
  const intervalSeconds = Number.parseInt(
    options.intervalSecondsRaw ?? "2",
    10,
  );
  return {
    timeoutSeconds,
    intervalMs: intervalSeconds * 1000,
  };
}

/** Polls a runtime-ready predicate until success or `timeoutSeconds` elapses. */
export function LocalEdgeCore_waitForRuntimeReady(options: {
  timeoutSeconds: number;
  nowMs: () => number;
  isRunning: LocalEdgeCore_RuntimeReadyPredicate;
  sleep: LocalEdgeCore_RuntimeWaitSleep;
}): boolean {
  const deadline = options.nowMs() + options.timeoutSeconds * 1000;

  while (options.nowMs() < deadline) {
    if (options.isRunning()) {
      return true;
    }
    options.sleep();
  }

  return options.isRunning();
}

/** Returns the canonical per-method log file path for shell command wrappers. */
export function LocalEdgeCore_buildMethodLogFilePath(options: {
  logDir: string;
  method: string;
}): string {
  return `${options.logDir}/${options.method}.log`;
}

/** Plans a background `nohup bash -lc <command>` invocation. */
export function LocalEdgeCore_buildNohupBashCommandPlan(
  command: string,
): LocalEdgeCore_ShellCommandPlan {
  return { command: "nohup", args: ["bash", "-lc", command] };
}

/** Plans a foreground `bash -lc <command>` invocation. */
export function LocalEdgeCore_buildBashCommandPlan(
  command: string,
): LocalEdgeCore_ShellCommandPlan {
  return { command: "bash", args: ["-lc", command] };
}

/** Extracts the executable token from a shell command using the legacy whitespace rule. */
export function LocalEdgeCore_extractShellCommandBinary(
  command: string,
): string {
  return command
    .trimStart()
    .replace(/[ \t].*$/s, "")
    .replace(/["']/g, "");
}

/** Builds a generic `docker compose up -d` command string with quoted project/config values. */
export function LocalEdgeCore_buildDockerComposeUpDetachedCommand(options: {
  projectName: string;
  composePath: string;
}): string {
  return `docker compose -p "${options.projectName}" -f "${options.composePath}" up -d`;
}

/** Builds a generic `docker compose down` command string with quoted project/config values. */
export function LocalEdgeCore_buildDockerComposeDownCommand(options: {
  projectName: string;
  composePath: string;
}): string {
  return `docker compose -p "${options.projectName}" -f "${options.composePath}" down`;
}

/** Returns whether a listen host requires a non-default 127/8 loopback alias. */
export function LocalEdgeCore_isCustomLoopbackHost(host: string): boolean {
  return host.startsWith("127.") && host !== "127.0.0.1";
}
