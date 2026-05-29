/**
 * @fileoverview Verifies `packages/local-edge-core` runtime-stop helpers for PID line parsing,
 * checkout path prefix guards, injectable `kill`/`spawnSync` probes, checkout-scoped PID
 * collection, bounded wait-for-exit loops, TERM→KILL escalation, and TCP listener PID discovery.
 *
 * This file owns Node `node:test` regression coverage for `runtime-stop.ts` using in-memory fakes
 * only (no real host signals, `lsof`, or `pgrep` I/O).
 * Flow: configure fakes -> invoke `LocalEdgeCore_runtimeStop*` helpers -> assert parsed PIDs,
 * deduped checkout-scoped sets, wait/sleep counts, signal order, and stderr diagnostics.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/runtime-stop.unit.test.ts
 * @testing Node test runner (tsx): npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/runtime-stop.ts - Product-neutral process discovery and termination helpers whose injectable command runners, checkout guards, and signal escalation contracts are asserted here.
 * @see packages/local-edge-core/src/index.ts - Package entry barrel that re-exports the runtime-stop surface so downstream local-edge packages consume the same contracts exercised by this suite.
 * @see docs/LOCAL-EDGE.md - Local-edge operator documentation that situates runtime-stop behavior within startup, SIGINT stop, and cleanup workflows this module must stay aligned with.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_runtimeStopCollectCheckoutScopedPids,
  LocalEdgeCore_runtimeStopParsePidLines,
  LocalEdgeCore_runtimeStopPathIsWithinCheckout,
  LocalEdgeCore_runtimeStopPidIsAlive,
  LocalEdgeCore_runtimeStopResolvePidCwd,
  LocalEdgeCore_runtimeStopTerminateListenersOnPort,
  LocalEdgeCore_runtimeStopTerminatePidList,
  LocalEdgeCore_runtimeStopWaitForPidsExit,
} from "./runtime-stop.js";

import type {
  LocalEdgeCore_RuntimeStop_CommandInvocation,
  LocalEdgeCore_RuntimeStop_CommandResult,
  LocalEdgeCore_RuntimeStop_Kill,
  LocalEdgeCore_RuntimeStop_SpawnSync,
} from "./runtime-stop.js";

/** Creates an in-memory diagnostic writer for runtime-stop assertions. */
function makeWriter(): { messages: string[]; writer: { write(message: string): unknown } } {
  const messages: string[] = [];
  return {
    messages,
    writer: {
      /** Records one diagnostic message. */
      write(message: string): unknown {
        messages.push(message);
        return true;
      },
    },
  };
}

test("LocalEdgeCore_runtimeStopParsePidLines filters non-decimal lines", () => {
  assert.deepEqual(
    LocalEdgeCore_runtimeStopParsePidLines("42\nabc\n 003 \n12x\n\n0\n"),
    [42, 3, 0],
  );
});

test("LocalEdgeCore_runtimeStopPathIsWithinCheckout rejects sibling prefix collisions", () => {
  assert.equal(
    LocalEdgeCore_runtimeStopPathIsWithinCheckout({ cwd: "/repo", projectRoot: "/repo" }),
    true,
  );
  assert.equal(
    LocalEdgeCore_runtimeStopPathIsWithinCheckout({ cwd: "/repo/app", projectRoot: "/repo" }),
    true,
  );
  assert.equal(
    LocalEdgeCore_runtimeStopPathIsWithinCheckout({
      cwd: "/repo-other/app",
      projectRoot: "/repo",
    }),
    false,
  );
});

test("LocalEdgeCore_runtimeStopPidIsAlive supports injectable kill and diagnostics", () => {
  const { messages, writer } = makeWriter();

  /** Fake kill implementation that treats every probed PID as alive. */
  const aliveKill: LocalEdgeCore_RuntimeStop_Kill = () => undefined;

  /** Fake kill implementation that treats every probed PID as absent. */
  const deadKill: LocalEdgeCore_RuntimeStop_Kill = () => {
    throw new Error("missing");
  };

  assert.equal(
    LocalEdgeCore_runtimeStopPidIsAlive({ pid: 10, kill: aliveKill, stderr: writer }),
    true,
  );
  assert.equal(
    LocalEdgeCore_runtimeStopPidIsAlive({ pid: 11, kill: deadKill, stderr: writer }),
    false,
  );
  assert.match(messages.join(""), /PID 11 check error/);
});

test("LocalEdgeCore_runtimeStopResolvePidCwd reads lsof cwd records", () => {
  /** Fake lsof runner that returns a cwd record for the requested PID. */
  const spawnSync: LocalEdgeCore_RuntimeStop_SpawnSync = (invocation) => {
    assert.equal(invocation.command, "lsof");
    assert.deepEqual(invocation.args, ["-a", "-p", "77", "-d", "cwd", "-Fn"]);
    return { status: 0, stdout: "p77\nn/tmp/repo\n" };
  };

  assert.equal(LocalEdgeCore_runtimeStopResolvePidCwd({ pid: 77, spawnSync }), "/tmp/repo");
});

test("LocalEdgeCore_runtimeStopCollectCheckoutScopedPids deduplicates checkout-scoped pids", () => {
  const outputs = new Map<string, string>([
    ["alpha", "22\n11\nignored\n"],
    ["beta", "22\n33\n"],
  ]);

  /** Fake pgrep runner keyed by the requested search pattern. */
  const spawnSync: LocalEdgeCore_RuntimeStop_SpawnSync = (invocation) => ({
    status: 0,
    stdout: outputs.get(invocation.args[1] ?? "") ?? "",
  });
  const cwdByPid = new Map<number, string | null>([
    [11, "/repo"],
    [22, "/repo/app"],
    [33, "/elsewhere"],
  ]);

  assert.deepEqual(
    LocalEdgeCore_runtimeStopCollectCheckoutScopedPids({
      projectRoot: "/repo",
      patterns: ["alpha", "beta"],
      spawnSync,
      resolvePidCwd: (pid) => cwdByPid.get(pid) ?? null,
    }),
    [11, 22],
  );
});

test("LocalEdgeCore_runtimeStopWaitForPidsExit sleeps until all pids exit or attempts end", () => {
  let checks = 0;
  let sleeps = 0;

  /** Fake sleep runner that counts sleep attempts without blocking. */
  const spawnSync: LocalEdgeCore_RuntimeStop_SpawnSync = () => {
    sleeps += 1;
    return { status: 0, stdout: null };
  };

  assert.equal(
    LocalEdgeCore_runtimeStopWaitForPidsExit({
      pids: [1],
      attempts: 3,
      spawnSync,
      pidIsAlive: () => {
        checks += 1;
        return checks < 3;
      },
    }),
    true,
  );
  assert.equal(sleeps, 2);
});

test("LocalEdgeCore_runtimeStopTerminatePidList escalates from TERM to KILL", () => {
  const { messages, writer } = makeWriter();
  const signals: string[] = [];

  /** Fake signal sender that records the escalation sequence. */
  const kill: LocalEdgeCore_RuntimeStop_Kill = (pid, signal) => {
    signals.push(`${String(pid)}:${String(signal)}`);
  };

  LocalEdgeCore_runtimeStopTerminatePidList({
    pids: [4, 4, 5],
    kill,
    stderr: writer,
    pidIsAlive: () => true,
    waitForPidsExit: ({ attempts }) => attempts !== 12,
  });

  assert.deepEqual(signals, [
    "4:SIGTERM",
    "5:SIGTERM",
    "4:SIGKILL",
    "5:SIGKILL",
  ]);
  assert.match(messages.join(""), /Live PIDs: 4 5, sending TERM/);
  assert.match(messages.join(""), /Remaining PIDs after TERM: 4 5, sending KILL/);
});

test("LocalEdgeCore_runtimeStopTerminateListenersOnPort parses lsof listener pids", () => {
  const invocations: LocalEdgeCore_RuntimeStop_CommandInvocation[] = [];

  /** Fake listener probe that captures the requested lsof invocation. */
  const spawnSync: LocalEdgeCore_RuntimeStop_SpawnSync = (invocation) => {
    invocations.push(invocation);
    const result: LocalEdgeCore_RuntimeStop_CommandResult = {
      status: 0,
      stdout: "9\n10\n",
    };
    return result;
  };
  const terminated: number[][] = [];

  LocalEdgeCore_runtimeStopTerminateListenersOnPort({
    port: 443,
    spawnSync,
    terminatePidList: (pids) => terminated.push(pids),
  });

  assert.deepEqual(invocations.map((invocation) => invocation.command), ["lsof"]);
  assert.deepEqual(invocations[0]?.args, ["-tiTCP:443", "-sTCP:LISTEN"]);
  assert.deepEqual(terminated, [[9, 10]]);
});
