/**
 * @fileoverview Verifies network probe helpers for TCP listener checks, bounded wait loops, loopback
 * alias acceptance, synchronous router HTTP probes, and legacy proxy conflict detection used by
 * local-edge health flows.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` exports from `network.js`,
 * including ephemeral TCP servers, a child-process HTTP server for curl-based probes, and temp
 * plist paths that never touch real macOS marker files.
 * Flow: bind sockets or spawn probe child -> invoke helpers -> assert booleans and shutdown cleanup.
 *
 * @example
 * ```typescript
 * test("LocalEdgeCore_isTcpPortListening returns false for an unused port", async () => {
 *   assert.equal(
 *     await LocalEdgeCore_isTcpPortListening({
 *       host: "127.0.0.1",
 *       port: 1,
 *       timeoutMs: 50,
 *     }),
 *     false,
 *   );
 * });
 * ```
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/network.unit.test.ts
 *
 * @see packages/local-edge-core/src/network.ts - Product-neutral socket, `lsof`, curl, and plist-backed helpers under test whose best-effort semantics are asserted here.
 * @see packages/local-edge-core/src/host-mutations.ts - `@gg-utils/local-edge-core/host-mutations` barrel that re-exports `network.js` helpers alongside DNS, TLS, and Docker lifecycle modules for host-mutation planning that depends on the probe behavior covered here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_isPortListening,
  LocalEdgeCore_isTcpPortListening,
  LocalEdgeCore_legacyProxyConflictPresent,
  LocalEdgeCore_loopbackAliasExists,
  LocalEdgeCore_routerHostProbe,
  LocalEdgeCore_waitForPort,
  LocalEdgeCore_waitForPortClosed,
} from "./network.js";

/** Starts a TCP server and resolves once Node has assigned the requested bind. */
function listen(server: net.Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/** Closes a TCP server and surfaces close errors as rejected promises. */
function close(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Child-process HTTP server details used by synchronous curl probe tests. */
type ProbeServer = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly url: string;
};

/**
 * Starts an HTTP server in a separate Node process so synchronous curl probes do not block the
 * server event loop while the test process is waiting on `spawnSync`.
 */
function startProbeServer(): Promise<ProbeServer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-e",
      [
        'const http = require("node:http");',
        "const server = http.createServer((_request, response) => {",
        "  response.writeHead(204);",
        "  response.end();",
        "});",
        'server.listen(0, "127.0.0.1", () => {',
        "  const address = server.address();",
        '  if (address === null || typeof address === "string") {',
        "    process.exit(2);",
        "    return;",
        "  }",
        '  process.stdout.write(`${address.port}\\n`);',
        "});",
        'process.on("SIGTERM", () => server.close(() => process.exit(0)));',
      ].join("\n"),
    ]);

    let settled = false;
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Timed out waiting for probe server to announce its port."));
    }, 5000);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      if (settled) {
        return;
      }
      stdout += chunk;
      const match = stdout.match(/^(\d+)\n/);
      if (match === null) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        process: child,
        url: `http://127.0.0.1:${match[1]}/health`,
      });
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Probe server exited before announcing a port: code=${String(code)} signal=${String(
            signal,
          )} stderr=${stderr}`,
        ),
      );
    });
  });
}

/** Stops a child-process HTTP probe server and waits for its shutdown. */
function stopProbeServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for probe server shutdown."));
    }, 5000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

test("LocalEdgeCore_isTcpPortListening returns true for an accepting socket", async () => {
  const server = net.createServer((socket) => {
    socket.end();
  });
  await listen(server, "127.0.0.1", 0);

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    assert.equal(
      await LocalEdgeCore_isTcpPortListening({
        host: "127.0.0.1",
        port: address.port,
        timeoutMs: 250,
      }),
      true,
    );
  } finally {
    await close(server);
  }
});

test("LocalEdgeCore_isTcpPortListening returns false for an unused local port", async () => {
  const server = net.createServer();
  await listen(server, "127.0.0.1", 0);
  const address = server.address();
  if (address === null || typeof address === "string") {
    await close(server);
    throw new Error("Expected TCP server address");
  }
  const releasedPort = address.port;
  await close(server);

  assert.equal(
    await LocalEdgeCore_isTcpPortListening({
      host: "127.0.0.1",
      port: releasedPort,
      timeoutMs: 250,
    }),
    false,
  );
});

test("LocalEdgeCore_isPortListening and wait helpers detect a live TCP listener", async () => {
  const server = net.createServer((socket) => {
    socket.end();
  });
  await listen(server, "127.0.0.1", 0);

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    assert.equal(
      LocalEdgeCore_isPortListening({
        host: "127.0.0.1",
        port: address.port,
      }),
      true,
    );
    assert.equal(
      LocalEdgeCore_waitForPort({
        host: "127.0.0.1",
        port: address.port,
        timeoutSeconds: 0,
      }),
      true,
    );
  } finally {
    await close(server);
  }
});

test("LocalEdgeCore_waitForPortClosed returns true for an unused local port", async () => {
  const server = net.createServer();
  await listen(server, "127.0.0.1", 0);
  const address = server.address();
  if (address === null || typeof address === "string") {
    await close(server);
    throw new Error("Expected TCP server address");
  }
  const releasedPort = address.port;
  await close(server);

  assert.equal(
    LocalEdgeCore_waitForPortClosed({
      host: "127.0.0.1",
      port: releasedPort,
      timeoutSeconds: 0,
    }),
    true,
  );
});

test("LocalEdgeCore_loopbackAliasExists accepts the default loopback alias", () => {
  assert.equal(LocalEdgeCore_loopbackAliasExists("127.0.0.1"), true);
});

test("LocalEdgeCore_routerHostProbe accepts a local HTTP response code", async () => {
  const previousNoProxy = process.env.NO_PROXY;
  process.env.NO_PROXY = "*";
  const server = await startProbeServer();

  try {
    assert.equal(
      LocalEdgeCore_routerHostProbe({
        url: server.url,
        connectTimeout: 2,
        maxTime: 3,
      }),
      true,
    );
  } finally {
    if (previousNoProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = previousNoProxy;
    }
    await stopProbeServer(server.process);
  }
});

test("LocalEdgeCore_legacyProxyConflictPresent is false when the marker plist is missing", async () => {
  const server = net.createServer((socket) => {
    socket.end();
  });
  await listen(server, "127.0.0.1", 0);

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    assert.equal(
      LocalEdgeCore_legacyProxyConflictPresent({
        host: "127.0.0.1",
        plistPath: path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-network-")),
          "missing.plist",
        ),
        port: address.port,
      }),
      false,
    );
  } finally {
    await close(server);
  }
});
