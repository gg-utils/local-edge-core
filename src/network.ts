/**
 * @fileoverview Product-neutral network probe helpers for local-edge routers and diagnostics.
 *
 * This file owns best-effort TCP client probes, `lsof`-based listener checks, macOS `lo0` loopback
 * alias detection, SIGTERM cleanup for processes listening on a port, and curl-backed HTTP health
 * probes; callers decide which host/port pairs matter, how failures surface to operators, and
 * whether a failed probe should influence process exit behavior.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/network.unit.test.ts
 *
 * @see packages/local-edge-core/src/index.ts - Root `@gg-utils/local-edge-core` barrel that re-exports these network helpers alongside other local-edge primitives wired into kit CLIs and shared workflows.
 * @see packages/local-edge-core/src/host-mutations.ts - Host-mutation subpath barrel that re-exports these helpers when operators coordinate DNS, TLS, Docker, and listener-side host changes together.
 * @see packages/local-edge-core/src/network.unit.test.ts - Jest regression module that exercises TCP probes, listener polling, loopback alias parsing, and router curl probes for this module's exports.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

const LOCAL_EDGE_CORE_NETWORK_POLL_INTERVAL_MS = 1000;

/** Options for a best-effort TCP listener probe. */
export type LocalEdgeCore_TcpPortProbeOptions = {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
};

/**
 * Returns whether a TCP connection can be established before timeout/error.
 *
 * @remarks
 * This is intentionally best-effort and side-effect-light: it opens and immediately destroys one
 * client socket, returning `false` for timeout, refusal, DNS, and other connection errors.
 */
export function LocalEdgeCore_isTcpPortListening(
  options: LocalEdgeCore_TcpPortProbeOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: options.host,
      port: options.port,
    });

    /** Completes the probe and destroys the client socket after the first terminal event. */
    const settle = (value: boolean): void => {
      socket.removeAllListeners();
      if (!socket.destroyed) {
        socket.destroy();
      }
      resolve(value);
    };

    socket.setTimeout(options.timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/** Returns true when a TCP listener is active on `port`, optionally scoped to `host`. */
export function LocalEdgeCore_isPortListening(options: {
  port: number;
  host?: string;
}): boolean {
  const { port, host } = options;

  if (host !== undefined && host.length > 0) {
    const result = spawnSync(
      "lsof",
      ["-nP", `-iTCP@${host}:${String(port)}`, "-sTCP:LISTEN"],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 5000 },
    );
    return result.status === 0;
  }

  const result = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${String(port)}`, "-sTCP:LISTEN"],
    { stdio: ["ignore", "ignore", "ignore"], timeout: 5000 },
  );
  return result.status === 0;
}

/** Polls until `port` has an active listener or `timeoutSeconds` elapses. */
export function LocalEdgeCore_waitForPort(options: {
  port: number;
  timeoutSeconds: number;
  host?: string;
}): boolean {
  const deadline = Date.now() + options.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    if (
      LocalEdgeCore_isPortListening({
        port: options.port,
        host: options.host,
      })
    ) {
      return true;
    }
    spawnSync("sleep", ["1"], {
      stdio: "ignore",
      timeout: LOCAL_EDGE_CORE_NETWORK_POLL_INTERVAL_MS + 500,
    });
  }

  return LocalEdgeCore_isPortListening({
    port: options.port,
    host: options.host,
  });
}

/** Polls until `port` has no active listener or `timeoutSeconds` elapses. */
export function LocalEdgeCore_waitForPortClosed(options: {
  port: number;
  timeoutSeconds: number;
  host?: string;
}): boolean {
  const deadline = Date.now() + options.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    if (
      !LocalEdgeCore_isPortListening({
        port: options.port,
        host: options.host,
      })
    ) {
      return true;
    }
    spawnSync("sleep", ["1"], {
      stdio: "ignore",
      timeout: LOCAL_EDGE_CORE_NETWORK_POLL_INTERVAL_MS + 500,
    });
  }

  return !LocalEdgeCore_isPortListening({
    port: options.port,
    host: options.host,
  });
}

/** Returns true when a loopback alias for `ip` exists on `lo0`; `127.0.0.1` is always present. */
export function LocalEdgeCore_loopbackAliasExists(ip: string): boolean {
  if (ip === "127.0.0.1") {
    return true;
  }

  const result = spawnSync("ifconfig", ["lo0"], {
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });

  if (result.status !== 0 || result.stdout === null) {
    return false;
  }

  const output = result.stdout.toString("utf-8");
  const pattern = new RegExp(`\\s+inet\\s+${ip.replace(/\./g, "\\.")}(\\s|$)`);
  return pattern.test(output);
}

/** Finds and terminates processes listening on `port` via SIGTERM. */
export function LocalEdgeCore_terminateListenersOnPort(port: number): void {
  const result = spawnSync(
    "lsof",
    [`-tiTCP:${String(port)}`, "-sTCP:LISTEN"],
    { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 },
  );

  if (result.status !== 0 || result.stdout === null) {
    return;
  }

  const pids = result.stdout
    .toString("utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map((pid) => Number.parseInt(pid, 10));

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? error.code
          : undefined;
      if (code !== "ESRCH") {
        throw error;
      }
    }
  }
}

/** Issues a curl health probe and accepts any real 3-digit HTTP status except `000`. */
export function LocalEdgeCore_routerHostProbe(options: {
  url: string;
  connectTimeout: number;
  maxTime: number;
}): boolean {
  const result = spawnSync(
    "curl",
    [
      "-k",
      "-sS",
      "-o",
      "/dev/null",
      "--connect-timeout",
      String(options.connectTimeout),
      "--max-time",
      String(options.maxTime),
      "-w",
      "%{http_code}",
      options.url,
    ],
    {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: (options.maxTime + 2) * 1000,
    },
  );

  if (result.status !== 0 || result.stdout === null) {
    return false;
  }

  const httpCode = result.stdout.toString("utf-8").trim();
  return /^\d{3}$/.test(httpCode) && httpCode !== "000";
}

/** Returns true when a legacy host-managed proxy plist exists and the target host/port listens. */
export function LocalEdgeCore_legacyProxyConflictPresent(options: {
  plistPath: string;
  port: number;
  host: string;
}): boolean {
  if (!existsSync(options.plistPath)) {
    return false;
  }
  return LocalEdgeCore_isPortListening({
    port: options.port,
    host: options.host,
  });
}
