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
/** Builds the `docker info` argument list used for daemon readiness checks. */
export function LocalEdgeCore_buildDockerInfoArgs() {
    return ["info"];
}
/** Builds a Docker Compose `ps -q` argument list, optionally scoped to one service. */
export function LocalEdgeCore_buildDockerComposePsArgs(options) {
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
export function LocalEdgeCore_parseDockerComposePsContainerId(stdout) {
    const containerId = stdout.trim();
    return containerId.length > 0 ? containerId : null;
}
/** Builds Docker inspect args for checking whether a container is running. */
export function LocalEdgeCore_buildDockerInspectRunningFormatArgs(containerId) {
    return ["inspect", "--format", "{{.State.Running}}", containerId];
}
/** Parses Docker inspect running-state text. */
export function LocalEdgeCore_parseDockerRunningState(stdout) {
    return stdout.trim() === "true";
}
/** Builds Docker exec args for reloading nginx inside a running container. */
export function LocalEdgeCore_buildDockerExecNginxReloadArgs(containerId) {
    return ["exec", containerId, "nginx", "-s", "reload"];
}
/** Builds Docker inspect args for reading the source mounted at a destination path. */
export function LocalEdgeCore_buildDockerMountSourceInspectArgs(options) {
    return [
        "inspect",
        "--format",
        `{{range .Mounts}}{{if eq .Destination "${options.destinationPath}"}}{{.Source}}{{end}}{{end}}`,
        options.containerId,
    ];
}
/** Parses a Docker inspect mount-source result. */
export function LocalEdgeCore_parseDockerMountSource(stdout) {
    return stdout.trim();
}
/** Returns true when `docker info` succeeds through an adapter-owned Docker runner. */
export function LocalEdgeCore_dockerLifecycleDaemonReady(options) {
    const result = options.runDockerCommand({
        args: LocalEdgeCore_buildDockerInfoArgs(),
        mode: "ignore",
        timeoutMs: 10_000,
    });
    return result.status === 0;
}
/** Returns the Docker Compose container id for a project/config pair, or null. */
export function LocalEdgeCore_dockerLifecycleContainerId(options) {
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
export function LocalEdgeCore_dockerLifecycleContainerRunning(options) {
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
export function LocalEdgeCore_dockerLifecycleReloadNginxContainer(options) {
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
export function LocalEdgeCore_dockerLifecycleMountSourceForDestination(options) {
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
export function LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts(options) {
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
export function LocalEdgeCore_nginxDockerRuntimeMatchesArtifacts(options) {
    const expectedMounts = LocalEdgeCore_buildNginxDockerRuntimeExpectedMounts(options);
    const actualSourceByDestination = new Map();
    for (const expectedMount of expectedMounts) {
        actualSourceByDestination.set(expectedMount.destinationPath, options.resolveMountSource({
            containerId: options.containerId,
            destinationPath: expectedMount.destinationPath,
        }));
    }
    return LocalEdgeCore_mountSourcesMatch({
        expectedMounts,
        actualSourceByDestination,
    });
}
/** Returns true when every expected mount destination resolves to the expected source path. */
export function LocalEdgeCore_mountSourcesMatch(options) {
    for (const expectedMount of options.expectedMounts) {
        if (options.actualSourceByDestination.get(expectedMount.destinationPath) !==
            expectedMount.expectedSourcePath) {
            return false;
        }
    }
    return true;
}
/** Resolves a Docker Desktop `.app` path from explicit host facts. */
export function LocalEdgeCore_resolveDockerDesktopAppPath(options) {
    if (options.pathExists("/Applications/Docker.app")) {
        return "/Applications/Docker.app";
    }
    if (options.homeDir.length > 0 &&
        options.pathExists(`${options.homeDir}/Applications/Docker.app`)) {
        return `${options.homeDir}/Applications/Docker.app`;
    }
    return null;
}
/** Parses Docker wait timeout/interval environment values with legacy defaults. */
export function LocalEdgeCore_parseDockerWaitPolicy(options) {
    const timeoutSeconds = Number.parseInt(options.timeoutSecondsRaw ?? "120", 10);
    const intervalSeconds = Number.parseInt(options.intervalSecondsRaw ?? "2", 10);
    return {
        timeoutSeconds,
        intervalMs: intervalSeconds * 1000,
    };
}
/** Polls a runtime-ready predicate until success or `timeoutSeconds` elapses. */
export function LocalEdgeCore_waitForRuntimeReady(options) {
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
export function LocalEdgeCore_buildMethodLogFilePath(options) {
    return `${options.logDir}/${options.method}.log`;
}
/** Plans a background `nohup bash -lc <command>` invocation. */
export function LocalEdgeCore_buildNohupBashCommandPlan(command) {
    return { command: "nohup", args: ["bash", "-lc", command] };
}
/** Plans a foreground `bash -lc <command>` invocation. */
export function LocalEdgeCore_buildBashCommandPlan(command) {
    return { command: "bash", args: ["-lc", command] };
}
/** Extracts the executable token from a shell command using the legacy whitespace rule. */
export function LocalEdgeCore_extractShellCommandBinary(command) {
    return command
        .trimStart()
        .replace(/[ \t].*$/s, "")
        .replace(/["']/g, "");
}
/** Builds a generic `docker compose up -d` command string with quoted project/config values. */
export function LocalEdgeCore_buildDockerComposeUpDetachedCommand(options) {
    return `docker compose -p "${options.projectName}" -f "${options.composePath}" up -d`;
}
/** Builds a generic `docker compose down` command string with quoted project/config values. */
export function LocalEdgeCore_buildDockerComposeDownCommand(options) {
    return `docker compose -p "${options.projectName}" -f "${options.composePath}" down`;
}
/** Returns whether a listen host requires a non-default 127/8 loopback alias. */
export function LocalEdgeCore_isCustomLoopbackHost(host) {
    return host.startsWith("127.") && host !== "127.0.0.1";
}
//# sourceMappingURL=docker-lifecycle.js.map