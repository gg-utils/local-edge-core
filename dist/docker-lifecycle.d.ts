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
export type LocalEdgeCore_DockerLifecycleCommandRunner = (invocation: LocalEdgeCore_DockerLifecycleCommandInvocation) => LocalEdgeCore_DockerLifecycleCommandResult;
/** Injectable runtime polling predicate. */
export type LocalEdgeCore_RuntimeReadyPredicate = () => boolean;
/** Injectable sleep/wait operation for runtime polling loops. */
export type LocalEdgeCore_RuntimeWaitSleep = () => void;
/** Builds the `docker info` argument list used for daemon readiness checks. */
export declare function LocalEdgeCore_buildDockerInfoArgs(): string[];
/** Builds a Docker Compose `ps -q` argument list, optionally scoped to one service. */
export declare function LocalEdgeCore_buildDockerComposePsArgs(options: {
    projectName: string;
    composePath: string;
    serviceName?: string;
}): string[];
/** Parses a Docker Compose `ps -q` result as the historical trimmed container id string. */
export declare function LocalEdgeCore_parseDockerComposePsContainerId(stdout: string): string | null;
/** Builds Docker inspect args for checking whether a container is running. */
export declare function LocalEdgeCore_buildDockerInspectRunningFormatArgs(containerId: string): string[];
/** Parses Docker inspect running-state text. */
export declare function LocalEdgeCore_parseDockerRunningState(stdout: string): boolean;
/** Builds Docker exec args for reloading nginx inside a running container. */
export declare function LocalEdgeCore_buildDockerExecNginxReloadArgs(containerId: string): string[];
/** Builds Docker inspect args for reading the source mounted at a destination path. */
export declare function LocalEdgeCore_buildDockerMountSourceInspectArgs(options: {
    containerId: string;
    destinationPath: string;
}): string[];
/** Parses a Docker inspect mount-source result. */
export declare function LocalEdgeCore_parseDockerMountSource(stdout: string): string;
/** Returns true when `docker info` succeeds through an adapter-owned Docker runner. */
export declare function LocalEdgeCore_dockerLifecycleDaemonReady(options: {
    runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean;
/** Returns the Docker Compose container id for a project/config pair, or null. */
export declare function LocalEdgeCore_dockerLifecycleContainerId(options: {
    projectName: string;
    composePath: string;
    runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): string | null;
/** Returns true when a Compose container exists and Docker inspect reports it as running. */
export declare function LocalEdgeCore_dockerLifecycleContainerRunning(options: {
    projectName: string;
    composePath: string;
    runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean;
/** Reloads nginx in the running container via an adapter-owned Docker runner. */
export declare function LocalEdgeCore_dockerLifecycleReloadNginxContainer(options: {
    projectName: string;
    composePath: string;
    runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): boolean;
/** Returns the source path mounted at `destinationPath`, or an empty string on probe failure. */
export declare function LocalEdgeCore_dockerLifecycleMountSourceForDestination(options: {
    containerId: string;
    destinationPath: string;
    runDockerCommand: LocalEdgeCore_DockerLifecycleCommandRunner;
}): string;
/** Builds the expected nginx-docker bind mounts for generated runtime artifacts. */
export declare function LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts(options: {
    expectedNginxConfPath: string;
    expectedCertPath: string;
    expectedKeyPath: string;
}): LocalEdgeCore_DockerExpectedMount[];
/** Compares expected nginx-docker artifact mounts against adapter-resolved mount sources. */
export declare function LocalEdgeCore_nginxDockerRuntimeMatchesArtifacts(options: {
    containerId: string;
    expectedNginxConfPath: string;
    expectedCertPath: string;
    expectedKeyPath: string;
    resolveMountSource: (options: {
        containerId: string;
        destinationPath: string;
    }) => string;
}): boolean;
/** Returns true when every expected mount destination resolves to the expected source path. */
export declare function LocalEdgeCore_mountSourcesMatch(options: {
    expectedMounts: readonly LocalEdgeCore_DockerExpectedMount[];
    actualSourceByDestination: ReadonlyMap<string, string>;
}): boolean;
/** Resolves a Docker Desktop `.app` path from explicit host facts. */
export declare function LocalEdgeCore_resolveDockerDesktopAppPath(options: {
    homeDir: string;
    pathExists: LocalEdgeCore_DockerPathExists;
}): string | null;
/** Parses Docker wait timeout/interval environment values with legacy defaults. */
export declare function LocalEdgeCore_parseDockerWaitPolicy(options: {
    timeoutSecondsRaw: string | undefined;
    intervalSecondsRaw: string | undefined;
}): LocalEdgeCore_DockerWaitPolicy;
/** Polls a runtime-ready predicate until success or `timeoutSeconds` elapses. */
export declare function LocalEdgeCore_waitForRuntimeReady(options: {
    timeoutSeconds: number;
    nowMs: () => number;
    isRunning: LocalEdgeCore_RuntimeReadyPredicate;
    sleep: LocalEdgeCore_RuntimeWaitSleep;
}): boolean;
/** Returns the canonical per-method log file path for shell command wrappers. */
export declare function LocalEdgeCore_buildMethodLogFilePath(options: {
    logDir: string;
    method: string;
}): string;
/** Plans a background `nohup bash -lc <command>` invocation. */
export declare function LocalEdgeCore_buildNohupBashCommandPlan(command: string): LocalEdgeCore_ShellCommandPlan;
/** Plans a foreground `bash -lc <command>` invocation. */
export declare function LocalEdgeCore_buildBashCommandPlan(command: string): LocalEdgeCore_ShellCommandPlan;
/** Extracts the executable token from a shell command using the legacy whitespace rule. */
export declare function LocalEdgeCore_extractShellCommandBinary(command: string): string;
/** Builds a generic `docker compose up -d` command string with quoted project/config values. */
export declare function LocalEdgeCore_buildDockerComposeUpDetachedCommand(options: {
    projectName: string;
    composePath: string;
}): string;
/** Builds a generic `docker compose down` command string with quoted project/config values. */
export declare function LocalEdgeCore_buildDockerComposeDownCommand(options: {
    projectName: string;
    composePath: string;
}): string;
/** Returns whether a listen host requires a non-default 127/8 loopback alias. */
export declare function LocalEdgeCore_isCustomLoopbackHost(host: string): boolean;
//# sourceMappingURL=docker-lifecycle.d.ts.map