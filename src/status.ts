/**
 * @fileoverview Product-neutral local-edge router status evaluation and rendering primitives.
 *
 * Core receives explicit method/container/probe facts and returns deterministic status reports,
 * Docker CLI argument plans, Docker probe sequencing through caller-injected runners, and text/JSON
 * output. It does not resolve command paths, open sockets, or know consumer service labels.
 *
 * @example
 * ```typescript
 * const cli = LocalEdgeCore_parseStatusCliArgs({
 *   args: ["--method", "nginx-docker", "--json"],
 *   defaultMethod: "nginx-docker",
 *   supportedMethods: ["nginx-docker"],
 *   commandLabel: "local-edge:status",
 * });
 * const report = LocalEdgeCore_buildStatusReport({
 *   selectedMethod: cli.method,
 *   configuredMethods: ["nginx-docker"],
 *   methodStatuses: [
 *     { method: "nginx-docker", host: "127.0.0.1", port: 443, running: true },
 *   ],
 * });
 * LocalEdgeCore_renderStatusText(report);
 * ```
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/status.unit.test.ts
 *
 * @see packages/local-edge-core/src/method-config.ts - Validates and normalizes `--method` selections before LocalEdgeCore_parseStatusCliArgs returns the resolved token used in status reports.
 * @see packages/local-edge-kit/src/status-cli.ts - Kit status subcommand that probes Docker and TCP listen state, then calls these helpers to assemble and print JSON or legacy text output.
 * @see packages/local-edge-core/src/status.unit.test.ts - Node test coverage for argv parsing, Docker arg builders, injected probe runners, report assembly, and legacy text/JSON rendering.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { LocalEdgeCore_validateRequestedMethod } from "./method-config.js";

/** Parsed CLI flags for generic local-edge status commands. */
export type LocalEdgeCore_StatusCliOptions = {
  method: "all" | string;
  outputMode: "json" | "text";
  requireAll: boolean;
  requireRunning: boolean;
};

/** Parses status command argv without loading env, probing Docker, or touching the filesystem. */
export function LocalEdgeCore_parseStatusCliArgs(options: {
  args: readonly string[];
  defaultMethod: string;
  supportedMethods: readonly string[];
  commandLabel: string;
}): LocalEdgeCore_StatusCliOptions {
  let outputMode: "json" | "text" = "text";
  let requireAll = false;
  let requireRunning = false;
  let requestedMethod = options.defaultMethod;

  for (let index = 0; index < options.args.length; index += 1) {
    const argument = options.args[index];

    switch (argument) {
      case "--json":
        outputMode = "json";
        break;
      case "--require-all":
        requireAll = true;
        break;
      case "--require-running":
        requireRunning = true;
        break;
      case "--method":
        requestedMethod = options.args[index + 1] ?? "";
        index += 1;
        break;
      default:
        throw new Error(
          `[${options.commandLabel}] Unknown option: ${argument}`,
        );
    }
  }

  return {
    method: LocalEdgeCore_validateRequestedMethod({
      allowAll: true,
      commandLabel: options.commandLabel,
      method: requestedMethod,
      supportedMethods: options.supportedMethods,
    }),
    outputMode,
    requireAll,
    requireRunning,
  };
}

/** One configured router method status after adapter-owned probes complete. */
export type LocalEdgeCore_MethodStatus = {
  method: string;
  host: string;
  port: number;
  running: boolean;
};

/** Selected method status shown by the status CLI. */
export type LocalEdgeCore_SelectedStatus = {
  method: string;
  port: number;
  running: boolean;
};

/** Full status report rendered as text or JSON by compatibility wrappers. */
export type LocalEdgeCore_StatusReport = {
  method: string;
  configuredMethods: string;
  selected: LocalEdgeCore_SelectedStatus;
  methodStatuses: readonly LocalEdgeCore_MethodStatus[];
  allRunning: boolean;
};

/** Options for building a status report from configured methods and probe results. */
export type LocalEdgeCore_BuildStatusReportOptions = {
  selectedMethod: "all" | string;
  configuredMethods: readonly string[];
  methodStatuses: readonly LocalEdgeCore_MethodStatus[];
};

/** Options for Docker Compose container-id argument generation. */
export type LocalEdgeCore_DockerComposeServiceArgsOptions = {
  projectName: string;
  composePath: string;
  serviceName: string;
};

/** Runs a Docker command and returns stdout text, or throws when the command fails. */
export type LocalEdgeCore_DockerTextCommandRunner = (
  args: readonly string[],
) => string;

/** Options for probing whether a Docker Compose service container is running. */
export type LocalEdgeCore_ProbeDockerComposeServiceRunningOptions = {
  projectName: string;
  composePath: string;
  serviceName: string;
  runDockerCommand: LocalEdgeCore_DockerTextCommandRunner;
};

/** Returns Docker Compose args for resolving a service container id. */
export function LocalEdgeCore_buildDockerComposeServiceContainerIdArgs(
  options: LocalEdgeCore_DockerComposeServiceArgsOptions,
): string[] {
  return [
    "compose",
    "-p",
    options.projectName,
    "-f",
    options.composePath,
    "ps",
    "-q",
    options.serviceName,
  ];
}

/** Returns Docker inspect args for reading a container running state. */
export function LocalEdgeCore_buildDockerInspectRunningArgs(
  containerId: string,
): string[] {
  return ["inspect", "-f", "{{.State.Running}}", containerId];
}

/** Parses the first non-empty container id emitted by `docker compose ps -q`. */
export function LocalEdgeCore_parseDockerComposeContainerId(
  stdout: string,
): string | null {
  const firstLine = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? null;
}

/** Parses Docker inspect's boolean running-state output. */
export function LocalEdgeCore_parseDockerInspectRunningState(
  stdout: string,
): boolean {
  return stdout.trim() === "true";
}

/**
 * Returns whether a Docker Compose service has a container whose inspected state is running.
 *
 * @remarks
 * The caller owns Docker binary resolution, subprocess timeout, stdio policy, and error reporting.
 * Core owns the product-neutral command ordering and legacy stdout parsing. Runner failures are
 * treated as a non-running service so compatibility wrappers can keep best-effort status behavior.
 */
export function LocalEdgeCore_probeDockerComposeServiceRunning(
  options: LocalEdgeCore_ProbeDockerComposeServiceRunningOptions,
): boolean {
  try {
    const containerIdOutput = options.runDockerCommand(
      LocalEdgeCore_buildDockerComposeServiceContainerIdArgs({
        projectName: options.projectName,
        composePath: options.composePath,
        serviceName: options.serviceName,
      }),
    );
    const containerId =
      LocalEdgeCore_parseDockerComposeContainerId(containerIdOutput);

    if (containerId === null) {
      return false;
    }

    const runningStateOutput = options.runDockerCommand(
      LocalEdgeCore_buildDockerInspectRunningArgs(containerId),
    );

    return LocalEdgeCore_parseDockerInspectRunningState(runningStateOutput);
  } catch {
    return false;
  }
}

/** Builds a deterministic status report from explicit method statuses. */
export function LocalEdgeCore_buildStatusReport(
  options: LocalEdgeCore_BuildStatusReportOptions,
): LocalEdgeCore_StatusReport {
  const statusesByMethod = new Map(
    options.methodStatuses.map((status) => [status.method, status]),
  );
  const allRunning = options.configuredMethods.every(
    (method) => statusesByMethod.get(method)?.running === true,
  );
  const selectedStatus =
    options.selectedMethod === "all"
      ? { method: options.selectedMethod, port: 0, running: allRunning }
      : {
          method: options.selectedMethod,
          port: statusesByMethod.get(options.selectedMethod)?.port ?? 0,
          running:
            statusesByMethod.get(options.selectedMethod)?.running === true,
        };

  return {
    method: options.selectedMethod,
    configuredMethods: options.configuredMethods.join(","),
    selected: selectedStatus,
    methodStatuses: options.methodStatuses,
    allRunning,
  };
}

/** Returns one method status by id or throws when absent. */
function LocalEdgeCore_requireMethodStatus(options: {
  report: LocalEdgeCore_StatusReport;
  method: string;
}): LocalEdgeCore_MethodStatus {
  const status = options.report.methodStatuses.find(
    (candidate) => candidate.method === options.method,
  );
  if (!status) {
    throw new Error(
      `[local-edge-core:status] Missing status for method '${options.method}'.`,
    );
  }
  return status;
}

/** Renders the status report using the legacy local-edge text format. */
export function LocalEdgeCore_renderStatusText(
  report: LocalEdgeCore_StatusReport,
): string {
  const lines: string[] = [];

  if (report.method === "all") {
    lines.push(
      `[local-edge:status] configuredMethods=${report.configuredMethods}`,
    );
    for (const method of report.configuredMethods.split(",").filter(Boolean)) {
      const status = LocalEdgeCore_requireMethodStatus({ report, method });
      lines.push(
        `[local-edge:status] ${method}  bind=${status.host}:${status.port} running=${String(
          status.running,
        )}`,
      );
    }
  } else {
    const status = LocalEdgeCore_requireMethodStatus({
      report,
      method: report.method,
    });
    lines.push(
      `[local-edge:status] ${report.method}  bind=${status.host}:${status.port} running=${String(
        status.running,
      )}`,
    );
  }

  lines.push(`[local-edge:status] allRunning=${String(report.allRunning)}`);
  return lines.join("\n");
}

/** Renders the status report as the legacy JSON object shape. */
export function LocalEdgeCore_renderStatusJson(
  report: LocalEdgeCore_StatusReport,
): string {
  const nginxDocker = LocalEdgeCore_requireMethodStatus({
    report,
    method: "nginx-docker",
  });

  return JSON.stringify(
    {
      method: report.method,
      configuredMethods: report.configuredMethods,
      selected: report.selected,
      nginxDocker: {
        running: nginxDocker.running,
        host: nginxDocker.host,
        port: nginxDocker.port,
      },
      allRunning: report.allRunning,
    },
    null,
    2,
  );
}
