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
import { spawnSync as nodeSpawnSync } from "node:child_process";
const LOCAL_EDGE_CORE_RUNTIME_STOP_TERM_WAIT_ATTEMPTS = 12;
const LOCAL_EDGE_CORE_RUNTIME_STOP_KILL_WAIT_ATTEMPTS = 4;
const LOCAL_EDGE_CORE_RUNTIME_STOP_WAIT_SLEEP_MS = 250;
const LOCAL_EDGE_CORE_RUNTIME_STOP_COMMAND_TIMEOUT_MS = 5000;
/** Runs host commands with the stdio mode requested by the generic runtime-stop helper. */
function LocalEdgeCore_runtimeStopDefaultSpawnSync(invocation) {
    if (invocation.mode === "pipe-stdout") {
        return nodeSpawnSync(invocation.command, invocation.args, {
            stdio: ["ignore", "pipe", "ignore"],
            timeout: invocation.timeoutMs,
        });
    }
    return nodeSpawnSync(invocation.command, invocation.args, {
        stdio: "ignore",
        timeout: invocation.timeoutMs,
    });
}
/** Sends a signal to a process through Node's process API. */
function LocalEdgeCore_runtimeStopDefaultKill(pid, signal) {
    process.kill(pid, signal);
}
/** Returns the default runtime-stop diagnostic writer. */
function LocalEdgeCore_runtimeStopDefaultWriter() {
    return process.stderr;
}
/** Converts captured command stdout to text while preserving null as missing output. */
function LocalEdgeCore_runtimeStopTextFromStdout(stdout) {
    if (stdout === null) {
        return null;
    }
    return typeof stdout === "string" ? stdout : stdout.toString("utf-8");
}
/** Sleeps for the legacy runtime-stop polling interval via the injected command runner. */
function LocalEdgeCore_runtimeStopSleep(options) {
    options.spawnSync({
        command: "sleep",
        args: [String(LOCAL_EDGE_CORE_RUNTIME_STOP_WAIT_SLEEP_MS / 1000)],
        mode: "ignore",
        timeoutMs: LOCAL_EDGE_CORE_RUNTIME_STOP_WAIT_SLEEP_MS + 500,
    });
}
/** Parses newline-delimited PID output, preserving the legacy decimal-integer filter. */
export function LocalEdgeCore_runtimeStopParsePidLines(output) {
    return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line))
        .map((pid) => Number.parseInt(pid, 10));
}
/** Returns true when `cwd` is exactly `projectRoot` or under it. */
export function LocalEdgeCore_runtimeStopPathIsWithinCheckout(options) {
    return (options.cwd === options.projectRoot ||
        options.cwd.startsWith(`${options.projectRoot}/`));
}
/** Returns true when a process is still alive according to `kill(pid, 0)`. */
export function LocalEdgeCore_runtimeStopPidIsAlive(options) {
    const kill = options.kill ?? LocalEdgeCore_runtimeStopDefaultKill;
    const stderr = options.stderr ?? LocalEdgeCore_runtimeStopDefaultWriter();
    try {
        kill(options.pid, 0);
        return true;
    }
    catch (error) {
        stderr.write(`[runtime-stop] PID ${String(options.pid)} check error: ${String(error)}\n`);
        return false;
    }
}
/** Resolves the current working directory for `pid` using `lsof`. */
export function LocalEdgeCore_runtimeStopResolvePidCwd(options) {
    const spawnSync = options.spawnSync ?? LocalEdgeCore_runtimeStopDefaultSpawnSync;
    const result = spawnSync({
        command: "lsof",
        args: ["-a", "-p", String(options.pid), "-d", "cwd", "-Fn"],
        mode: "pipe-stdout",
        timeoutMs: LOCAL_EDGE_CORE_RUNTIME_STOP_COMMAND_TIMEOUT_MS,
    });
    if (result.status !== 0) {
        return null;
    }
    const stdout = LocalEdgeCore_runtimeStopTextFromStdout(result.stdout);
    if (stdout === null) {
        return null;
    }
    const lines = stdout.split("\n");
    for (const line of lines) {
        if (line.startsWith("n")) {
            return line.slice(1).trim();
        }
    }
    return null;
}
/** Returns true when `pid` resolves to a cwd inside `projectRoot`. */
export function LocalEdgeCore_runtimeStopPidHasCheckoutCwd(options) {
    const resolvePidCwd = options.resolvePidCwd ??
        ((pid) => LocalEdgeCore_runtimeStopResolvePidCwd({ pid }));
    const cwd = resolvePidCwd(options.pid);
    if (cwd === null) {
        return false;
    }
    return LocalEdgeCore_runtimeStopPathIsWithinCheckout({
        cwd,
        projectRoot: options.projectRoot,
    });
}
/** Finds deduplicated `pgrep -f` PIDs whose cwd is inside `projectRoot`. */
export function LocalEdgeCore_runtimeStopCollectCheckoutScopedPids(options) {
    const spawnSync = options.spawnSync ?? LocalEdgeCore_runtimeStopDefaultSpawnSync;
    const resolvePidCwd = options.resolvePidCwd ??
        ((pid) => LocalEdgeCore_runtimeStopResolvePidCwd({ pid, spawnSync }));
    const seen = new Set();
    for (const pattern of options.patterns) {
        const result = spawnSync({
            command: "pgrep",
            args: ["-f", pattern],
            mode: "pipe-stdout",
            timeoutMs: LOCAL_EDGE_CORE_RUNTIME_STOP_COMMAND_TIMEOUT_MS,
        });
        if (result.status !== 0) {
            continue;
        }
        const stdout = LocalEdgeCore_runtimeStopTextFromStdout(result.stdout);
        if (stdout === null) {
            continue;
        }
        for (const pid of LocalEdgeCore_runtimeStopParsePidLines(stdout)) {
            if (seen.has(pid)) {
                continue;
            }
            if (LocalEdgeCore_runtimeStopPidHasCheckoutCwd({
                pid,
                projectRoot: options.projectRoot,
                resolvePidCwd,
            })) {
                seen.add(pid);
            }
        }
    }
    return [...seen].sort((a, b) => a - b);
}
/** Waits until all PIDs exit or the attempt budget is exhausted. */
export function LocalEdgeCore_runtimeStopWaitForPidsExit(options) {
    const maxAttempts = options.attempts ?? LOCAL_EDGE_CORE_RUNTIME_STOP_TERM_WAIT_ATTEMPTS;
    const pidIsAlive = options.pidIsAlive ??
        ((pid) => LocalEdgeCore_runtimeStopPidIsAlive({ pid }));
    const spawnSync = options.spawnSync ?? LocalEdgeCore_runtimeStopDefaultSpawnSync;
    let pending = options.pids.filter((pid) => pidIsAlive(pid));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (pending.length === 0) {
            return true;
        }
        LocalEdgeCore_runtimeStopSleep({ spawnSync });
        pending = pending.filter((pid) => pidIsAlive(pid));
    }
    return pending.length === 0;
}
/** Terminates a PID list with SIGTERM, wait, SIGKILL, wait escalation. */
export function LocalEdgeCore_runtimeStopTerminatePidList(options) {
    if (options.pids.length === 0) {
        return;
    }
    const kill = options.kill ?? LocalEdgeCore_runtimeStopDefaultKill;
    const stderr = options.stderr ?? LocalEdgeCore_runtimeStopDefaultWriter();
    const pidIsAlive = options.pidIsAlive ??
        ((pid) => LocalEdgeCore_runtimeStopPidIsAlive({ pid, kill, stderr }));
    const waitForPidsExit = options.waitForPidsExit ??
        ((waitOptions) => LocalEdgeCore_runtimeStopWaitForPidsExit({
            pids: waitOptions.pids,
            attempts: waitOptions.attempts,
            pidIsAlive,
        }));
    const unique = [...new Set(options.pids)];
    const live = unique.filter((pid) => pidIsAlive(pid));
    if (live.length === 0) {
        stderr.write("[runtime-stop] No live PIDs to terminate\n");
        return;
    }
    stderr.write(`[runtime-stop] Live PIDs: ${live.join(" ")}, sending TERM\n`);
    for (const pid of live) {
        try {
            kill(pid, "SIGTERM");
        }
        catch (error) {
            stderr.write(`[runtime-stop] SIGTERM error for PID ${String(pid)}: ${String(error)}\n`);
        }
    }
    if (waitForPidsExit({
        pids: live,
        attempts: LOCAL_EDGE_CORE_RUNTIME_STOP_TERM_WAIT_ATTEMPTS,
    })) {
        stderr.write("[runtime-stop] All PIDs terminated gracefully\n");
        return;
    }
    const remaining = live.filter((pid) => pidIsAlive(pid));
    if (remaining.length === 0) {
        return;
    }
    stderr.write(`[runtime-stop] Remaining PIDs after TERM: ${remaining.join(" ")}, sending KILL\n`);
    for (const pid of remaining) {
        try {
            kill(pid, "SIGKILL");
        }
        catch (error) {
            stderr.write(`[runtime-stop] SIGKILL error for PID ${String(pid)}: ${String(error)}\n`);
        }
    }
    waitForPidsExit({
        pids: remaining,
        attempts: LOCAL_EDGE_CORE_RUNTIME_STOP_KILL_WAIT_ATTEMPTS,
    });
}
/** Finds and terminates TCP listeners on `port`. */
export function LocalEdgeCore_runtimeStopTerminateListenersOnPort(options) {
    const spawnSync = options.spawnSync ?? LocalEdgeCore_runtimeStopDefaultSpawnSync;
    const terminatePidList = options.terminatePidList ??
        ((pids) => LocalEdgeCore_runtimeStopTerminatePidList({ pids }));
    const result = spawnSync({
        command: "lsof",
        args: [`-tiTCP:${String(options.port)}`, "-sTCP:LISTEN"],
        mode: "pipe-stdout",
        timeoutMs: LOCAL_EDGE_CORE_RUNTIME_STOP_COMMAND_TIMEOUT_MS,
    });
    if (result.status !== 0) {
        return;
    }
    const stdout = LocalEdgeCore_runtimeStopTextFromStdout(result.stdout);
    if (stdout === null) {
        return;
    }
    const pids = LocalEdgeCore_runtimeStopParsePidLines(stdout);
    if (pids.length > 0) {
        terminatePidList(pids);
    }
}
//# sourceMappingURL=runtime-stop.js.map