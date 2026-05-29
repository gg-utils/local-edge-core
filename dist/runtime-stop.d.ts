/**
 * @fileoverview Product-neutral runtime process discovery and termination helpers.
 *
 * Core owns the generic PID parsing, checkout-scoped process discovery, listener discovery, and
 * TERM→wait→KILL escalation mechanics. Consumer adapters decide which patterns, ports, and
 * workspace roots are safe to target.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/runtime-stop.unit.test.ts
 *
 * @see packages/local-edge-core/src/runtime-stop.unit.test.ts - Jest regression module that pins PID-line parsing, checkout cwd scoping, lsof-backed probes, and SIGTERM-to-SIGKILL escalation for the helpers exported here.
 * @see packages/local-edge-core/src/index.ts - Package entry barrel that re-exports this runtime-stop surface to other local-edge-core and kit modules.
 * @see scripts/local-edge/runtime-stop-lib.sh - Shell-side companion stop helpers operators source alongside the pgrep/lsof semantics this TypeScript module implements for automation and manual runs.
 *
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Minimal command result shape used by runtime-stop host probes. */
export type LocalEdgeCore_RuntimeStop_CommandResult = {
    status: number | null;
    stdout: Buffer | string | null;
};
/** Host command invocation mode for runtime-stop probes. */
export type LocalEdgeCore_RuntimeStop_CommandMode = "ignore" | "pipe-stdout";
/** Host command invocation request for runtime-stop probes. */
export type LocalEdgeCore_RuntimeStop_CommandInvocation = {
    command: string;
    args: string[];
    mode: LocalEdgeCore_RuntimeStop_CommandMode;
    timeoutMs: number;
};
/** Injectable command runner used by tests and adapters that need custom process execution. */
export type LocalEdgeCore_RuntimeStop_SpawnSync = (invocation: LocalEdgeCore_RuntimeStop_CommandInvocation) => LocalEdgeCore_RuntimeStop_CommandResult;
/** Injectable process signal sender. */
export type LocalEdgeCore_RuntimeStop_Kill = (pid: number, signal?: NodeJS.Signals | 0) => void;
/** Injectable process-aliveness probe. */
export type LocalEdgeCore_RuntimeStop_PidIsAlive = (pid: number) => boolean;
/** Injectable PID cwd resolver. */
export type LocalEdgeCore_RuntimeStop_ResolvePidCwd = (pid: number) => string | null;
/** Injectable wait loop for termination escalation. */
export type LocalEdgeCore_RuntimeStop_WaitForPidsExit = (options: {
    pids: number[];
    attempts: number;
}) => boolean;
/** Minimal stderr-like writer used for diagnostics. */
export type LocalEdgeCore_RuntimeStop_Writer = {
    write(message: string): unknown;
};
/** Parses newline-delimited PID output, preserving the legacy decimal-integer filter. */
export declare function LocalEdgeCore_runtimeStopParsePidLines(output: string): number[];
/** Returns true when `cwd` is exactly `projectRoot` or under it. */
export declare function LocalEdgeCore_runtimeStopPathIsWithinCheckout(options: {
    cwd: string;
    projectRoot: string;
}): boolean;
/** Returns true when a process is still alive according to `kill(pid, 0)`. */
export declare function LocalEdgeCore_runtimeStopPidIsAlive(options: {
    pid: number;
    kill?: LocalEdgeCore_RuntimeStop_Kill;
    stderr?: LocalEdgeCore_RuntimeStop_Writer;
}): boolean;
/** Resolves the current working directory for `pid` using `lsof`. */
export declare function LocalEdgeCore_runtimeStopResolvePidCwd(options: {
    pid: number;
    spawnSync?: LocalEdgeCore_RuntimeStop_SpawnSync;
}): string | null;
/** Returns true when `pid` resolves to a cwd inside `projectRoot`. */
export declare function LocalEdgeCore_runtimeStopPidHasCheckoutCwd(options: {
    pid: number;
    projectRoot: string;
    resolvePidCwd?: LocalEdgeCore_RuntimeStop_ResolvePidCwd;
}): boolean;
/** Finds deduplicated `pgrep -f` PIDs whose cwd is inside `projectRoot`. */
export declare function LocalEdgeCore_runtimeStopCollectCheckoutScopedPids(options: {
    projectRoot: string;
    patterns: string[];
    spawnSync?: LocalEdgeCore_RuntimeStop_SpawnSync;
    resolvePidCwd?: LocalEdgeCore_RuntimeStop_ResolvePidCwd;
}): number[];
/** Waits until all PIDs exit or the attempt budget is exhausted. */
export declare function LocalEdgeCore_runtimeStopWaitForPidsExit(options: {
    pids: number[];
    attempts?: number;
    pidIsAlive?: LocalEdgeCore_RuntimeStop_PidIsAlive;
    spawnSync?: LocalEdgeCore_RuntimeStop_SpawnSync;
}): boolean;
/** Terminates a PID list with SIGTERM, wait, SIGKILL, wait escalation. */
export declare function LocalEdgeCore_runtimeStopTerminatePidList(options: {
    pids: number[];
    kill?: LocalEdgeCore_RuntimeStop_Kill;
    pidIsAlive?: LocalEdgeCore_RuntimeStop_PidIsAlive;
    stderr?: LocalEdgeCore_RuntimeStop_Writer;
    waitForPidsExit?: LocalEdgeCore_RuntimeStop_WaitForPidsExit;
}): void;
/** Finds and terminates TCP listeners on `port`. */
export declare function LocalEdgeCore_runtimeStopTerminateListenersOnPort(options: {
    port: number;
    spawnSync?: LocalEdgeCore_RuntimeStop_SpawnSync;
    terminatePidList?: (pids: number[]) => void;
}): void;
//# sourceMappingURL=runtime-stop.d.ts.map