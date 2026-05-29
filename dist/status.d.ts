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
/** Parsed CLI flags for generic local-edge status commands. */
export type LocalEdgeCore_StatusCliOptions = {
    method: "all" | string;
    outputMode: "json" | "text";
    requireAll: boolean;
    requireRunning: boolean;
};
/** Parses status command argv without loading env, probing Docker, or touching the filesystem. */
export declare function LocalEdgeCore_parseStatusCliArgs(options: {
    args: readonly string[];
    defaultMethod: string;
    supportedMethods: readonly string[];
    commandLabel: string;
}): LocalEdgeCore_StatusCliOptions;
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
export type LocalEdgeCore_DockerTextCommandRunner = (args: readonly string[]) => string;
/** Options for probing whether a Docker Compose service container is running. */
export type LocalEdgeCore_ProbeDockerComposeServiceRunningOptions = {
    projectName: string;
    composePath: string;
    serviceName: string;
    runDockerCommand: LocalEdgeCore_DockerTextCommandRunner;
};
/** Returns Docker Compose args for resolving a service container id. */
export declare function LocalEdgeCore_buildDockerComposeServiceContainerIdArgs(options: LocalEdgeCore_DockerComposeServiceArgsOptions): string[];
/** Returns Docker inspect args for reading a container running state. */
export declare function LocalEdgeCore_buildDockerInspectRunningArgs(containerId: string): string[];
/** Parses the first non-empty container id emitted by `docker compose ps -q`. */
export declare function LocalEdgeCore_parseDockerComposeContainerId(stdout: string): string | null;
/** Parses Docker inspect's boolean running-state output. */
export declare function LocalEdgeCore_parseDockerInspectRunningState(stdout: string): boolean;
/**
 * Returns whether a Docker Compose service has a container whose inspected state is running.
 *
 * @remarks
 * The caller owns Docker binary resolution, subprocess timeout, stdio policy, and error reporting.
 * Core owns the product-neutral command ordering and legacy stdout parsing. Runner failures are
 * treated as a non-running service so compatibility wrappers can keep best-effort status behavior.
 */
export declare function LocalEdgeCore_probeDockerComposeServiceRunning(options: LocalEdgeCore_ProbeDockerComposeServiceRunningOptions): boolean;
/** Builds a deterministic status report from explicit method statuses. */
export declare function LocalEdgeCore_buildStatusReport(options: LocalEdgeCore_BuildStatusReportOptions): LocalEdgeCore_StatusReport;
/** Renders the status report using the legacy local-edge text format. */
export declare function LocalEdgeCore_renderStatusText(report: LocalEdgeCore_StatusReport): string;
/** Renders the status report as the legacy JSON object shape. */
export declare function LocalEdgeCore_renderStatusJson(report: LocalEdgeCore_StatusReport): string;
//# sourceMappingURL=status.d.ts.map