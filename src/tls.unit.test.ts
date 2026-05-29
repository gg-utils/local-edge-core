/**
 * @fileoverview Verifies TLS materialization, mkcert trust probing, and Tailscale MagicDNS suffix
 * resolution for local-edge HTTPS flows.
 *
 * This file owns Node test coverage for `LocalEdgeCore_ensureTlsFiles`, mkcert and macOS Keychain
 * trust probes, and tailnet suffix helpers using injectable fake filesystem and command adapters.
 * Flow: configure fake dependencies -> invoke TLS helpers -> assert recorded commands, warnings,
 * rejections, and normalized suffix strings.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/tls.unit.test.ts
 *
 * @see packages/local-edge-core/src/tls.ts - TLS orchestration module under test whose mkcert and openssl command shapes, provided-mode validation, trust detection, and tailscale JSON parsing behavior are asserted here.
 * @see packages/local-edge-kit/src/lifecycle-plans.ts - Kit lifecycle surface that injects `LocalEdgeCore_mkcertTrustDetected` into runtime dependency bundles so operator HTTPS readiness messaging stays aligned with the probe outcomes verified here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_detectTailnetSuffix,
  LocalEdgeCore_ensureTlsFiles,
  LocalEdgeCore_mkcertTrustDetected,
  LocalEdgeCore_resolveTailnetSuffix,
  type LocalEdgeCore_TlsDependencies,
  type LocalEdgeCore_TlsProbeCommandResult,
  type LocalEdgeCore_TlsProbeDependencies,
} from "./tls.js";

/** Command invocation captured by fake TLS dependencies. */
type RecordedCommand = {
  command: string;
  args: readonly string[];
};

/** Creates fake TLS dependencies that record filesystem and command effects. */
function createDependencies(existingPaths: readonly string[] = []): {
  dependencies: LocalEdgeCore_TlsDependencies;
  commands: RecordedCommand[];
  directories: string[];
  existing: Set<string>;
} {
  const existing = new Set(existingPaths);
  const commands: RecordedCommand[] = [];
  const directories: string[] = [];
  const dependencies: LocalEdgeCore_TlsDependencies = {
    fileSystem: {
      /** Returns true when the fake filesystem has the requested path. */
      fileExists(filePath: string): boolean {
        return existing.has(filePath);
      },
      /** Records directory creation in the fake filesystem. */
      async ensureDirectory(directoryPath: string): Promise<void> {
        directories.push(directoryPath);
        existing.add(directoryPath);
      },
    },
    /** Records a fake generator command and creates both TLS output files. */
    runCommand(command: string, args: readonly string[]): void {
      commands.push({ command, args });
      existing.add("/tmp/local-edge-cert.pem");
      existing.add("/tmp/local-edge-key.pem");
    },
  };
  return { dependencies, commands, directories, existing };
}

/** Creates fake host probe dependencies for mkcert and Tailscale detection helpers. */
function createProbeDependencies(options: {
  existingCommands?: readonly string[];
  existingPaths?: readonly string[];
  homeDir?: string;
  commandResults?: ReadonlyMap<string, LocalEdgeCore_TlsProbeCommandResult>;
}): LocalEdgeCore_TlsProbeDependencies {
  const existingCommands = new Set(options.existingCommands ?? []);
  const existingPaths = new Set(options.existingPaths ?? []);
  const commandResults = options.commandResults ?? new Map();

  return {
    /** Returns true when the fake host exposes the requested command. */
    commandExists(command: string): boolean {
      return existingCommands.has(command);
    },
    /** Returns true when the fake host filesystem contains the requested path. */
    fileExists(filePath: string): boolean {
      return existingPaths.has(filePath);
    },
    homeDir: options.homeDir ?? "/Users/local-edge",
    /** Returns a pre-seeded fake command result or a generic failing command result. */
    runCommand(command: string, args: readonly string[]): LocalEdgeCore_TlsProbeCommandResult {
      const result = commandResults.get([command, ...args].join("\u0000"));
      return (
        result ?? {
          status: 1,
          stdout: null,
        }
      );
    },
  };
}

/** Builds the fake command-result lookup key used by {@link createProbeDependencies}. */
function commandResultKey(command: string, args: readonly string[]): string {
  return [command, ...args].join("\u0000");
}

test("LocalEdgeCore_ensureTlsFiles validates provided certificate paths", async () => {
  const { dependencies } = createDependencies(["/tmp/local-edge-cert.pem"]);

  await assert.rejects(
    LocalEdgeCore_ensureTlsFiles({
      mode: "provided",
      certPath: "/tmp/local-edge-cert.pem",
      keyPath: "/tmp/local-edge-key.pem",
      hostnames: ["www.demo.test"],
      forceRegenerate: false,
      reuseExisting: false,
      messagePrefix: "[demo]",
      dependencies,
    }),
    /LOCAL_EDGE_TLS_MODE=provided requires existing files/,
  );
});

test("LocalEdgeCore_ensureTlsFiles reuses mkcert files when requested", async () => {
  const { dependencies, commands } = createDependencies([
    "/tmp/local-edge-cert.pem",
    "/tmp/local-edge-key.pem",
  ]);

  const warnings = await LocalEdgeCore_ensureTlsFiles({
    mode: "mkcert",
    certPath: "/tmp/local-edge-cert.pem",
    keyPath: "/tmp/local-edge-key.pem",
    hostnames: ["www.demo.test"],
    forceRegenerate: false,
    reuseExisting: true,
    messagePrefix: "[demo]",
    dependencies,
  });

  assert.deepEqual(warnings, []);
  assert.deepEqual(commands, []);
});

test("LocalEdgeCore_ensureTlsFiles runs mkcert with explicit output paths and hosts", async () => {
  const { dependencies, commands, directories } = createDependencies();

  const warnings = await LocalEdgeCore_ensureTlsFiles({
    mode: "mkcert",
    certPath: "/tmp/local-edge-cert.pem",
    keyPath: "/tmp/local-edge-key.pem",
    hostnames: ["www.demo.test", "*.demo.test"],
    forceRegenerate: false,
    reuseExisting: false,
    messagePrefix: "[demo]",
    dependencies,
  });

  assert.deepEqual(directories, ["/tmp"]);
  assert.deepEqual(commands, [
    {
      command: "mkcert",
      args: [
        "-cert-file",
        "/tmp/local-edge-cert.pem",
        "-key-file",
        "/tmp/local-edge-key.pem",
        "www.demo.test",
        "*.demo.test",
      ],
    },
  ]);
  assert.deepEqual(warnings, [
    "Generated mkcert TLS files: cert='/tmp/local-edge-cert.pem', " +
      "key='/tmp/local-edge-key.pem', hosts=2.",
  ]);
});

test("LocalEdgeCore_ensureTlsFiles runs openssl self-signed generation", async () => {
  const { dependencies, commands } = createDependencies();

  const warnings = await LocalEdgeCore_ensureTlsFiles({
    mode: "self-signed",
    certPath: "/tmp/local-edge-cert.pem",
    keyPath: "/tmp/local-edge-key.pem",
    hostnames: ["www.demo.test", "api.demo.test"],
    forceRegenerate: false,
    reuseExisting: false,
    messagePrefix: "[demo]",
    dependencies,
  });

  assert.equal(commands[0]?.command, "openssl");
  assert.deepEqual(commands[0]?.args.slice(0, 11), [
    "req",
    "-x509",
    "-nodes",
    "-newkey",
    "rsa:2048",
    "-keyout",
    "/tmp/local-edge-key.pem",
    "-out",
    "/tmp/local-edge-cert.pem",
    "-days",
    "30",
  ]);
  assert.deepEqual(commands[0]?.args.slice(-4), [
    "-subj",
    "/CN=www.demo.test",
    "-addext",
    "subjectAltName=DNS:www.demo.test,DNS:api.demo.test",
  ]);
  assert.deepEqual(warnings, [
    "Generated self-signed TLS files: cert='/tmp/local-edge-cert.pem', " +
      "key='/tmp/local-edge-key.pem'",
  ]);
});

test("LocalEdgeCore_ensureTlsFiles reports missing generated files", async () => {
  const { dependencies } = createDependencies();
  const failingDependencies: LocalEdgeCore_TlsDependencies = {
    ...dependencies,
    /** Simulates a command that exits successfully but writes no files. */
    runCommand(): void {
      return undefined;
    },
  };

  await assert.rejects(
    LocalEdgeCore_ensureTlsFiles({
      mode: "mkcert",
      certPath: "/tmp/local-edge-cert.pem",
      keyPath: "/tmp/local-edge-key.pem",
      hostnames: ["www.demo.test"],
      forceRegenerate: false,
      reuseExisting: false,
      messagePrefix: "[demo]",
      dependencies: failingDependencies,
    }),
    /mkcert TLS generation reported success but files are missing/,
  );
});

test("LocalEdgeCore_mkcertTrustDetected returns false when mkcert is unavailable", () => {
  assert.equal(
    LocalEdgeCore_mkcertTrustDetected(
      createProbeDependencies({
        existingCommands: [],
      }),
    ),
    false,
  );
});

test("LocalEdgeCore_mkcertTrustDetected accepts system keychain trust", () => {
  const commandResults = new Map<string, LocalEdgeCore_TlsProbeCommandResult>([
    [
      commandResultKey("mkcert", ["-CAROOT"]),
      {
        status: 0,
        stdout: "/tmp/mkcert-root\n",
      },
    ],
    [
      commandResultKey("security", [
        "find-certificate",
        "-a",
        "-c",
        "mkcert development CA",
        "/Library/Keychains/System.keychain",
      ]),
      {
        status: 0,
        stdout: "",
      },
    ],
  ]);

  assert.equal(
    LocalEdgeCore_mkcertTrustDetected(
      createProbeDependencies({
        commandResults,
        existingCommands: ["mkcert", "security"],
        existingPaths: ["/tmp/mkcert-root/rootCA.pem"],
      }),
    ),
    true,
  );
});

test("LocalEdgeCore_mkcertTrustDetected accepts user CA fallback without security", () => {
  assert.equal(
    LocalEdgeCore_mkcertTrustDetected(
      createProbeDependencies({
        commandResults: new Map([
          [
            commandResultKey("mkcert", ["-CAROOT"]),
            {
              status: 0,
              stdout: "/tmp/mkcert-root\n",
            },
          ],
        ]),
        existingCommands: ["mkcert"],
        existingPaths: [
          "/tmp/mkcert-root/rootCA.pem",
          "/Users/local-edge/.local/share/mkcert/rootCA.pem",
        ],
      }),
    ),
    true,
  );
});

test("LocalEdgeCore_detectTailnetSuffix prefers CurrentTailnet MagicDNS suffix", () => {
  const dependencies = createProbeDependencies({
    commandResults: new Map([
      [
        commandResultKey("tailscale", ["status", "--json"]),
        {
          status: 0,
          stdout: JSON.stringify({
            CurrentTailnet: { MagicDNSSuffix: "Current.Example.TS.Net " },
            MagicDNSSuffix: "global.example.ts.net",
          }),
        },
      ],
    ]),
    existingCommands: ["tailscale"],
  });

  assert.equal(LocalEdgeCore_detectTailnetSuffix(dependencies), "current.example.ts.net");
});

test("LocalEdgeCore_detectTailnetSuffix falls back to top-level MagicDNS suffix", () => {
  const dependencies = createProbeDependencies({
    commandResults: new Map([
      [
        commandResultKey("tailscale", ["status", "--json"]),
        {
          status: 0,
          stdout: JSON.stringify({
            MagicDNSSuffix: "Global.Example.TS.Net",
          }),
        },
      ],
    ]),
    existingCommands: ["tailscale"],
  });

  assert.equal(LocalEdgeCore_detectTailnetSuffix(dependencies), "global.example.ts.net");
});

test("LocalEdgeCore_resolveTailnetSuffix preserves explicit values and resolves auto", () => {
  const dependencies = createProbeDependencies({
    commandResults: new Map([
      [
        commandResultKey("tailscale", ["status", "--json"]),
        {
          status: 0,
          stdout: JSON.stringify({
            MagicDNSSuffix: "Auto.Example.TS.Net",
          }),
        },
      ],
    ]),
    existingCommands: ["tailscale"],
  });

  assert.equal(
    LocalEdgeCore_resolveTailnetSuffix(" Explicit.Example.TS.Net ", dependencies),
    "explicit.example.ts.net",
  );
  assert.equal(LocalEdgeCore_resolveTailnetSuffix("auto", dependencies), "auto.example.ts.net");
});

test("LocalEdgeCore_resolveTailnetSuffix falls back to the legacy default", () => {
  assert.equal(
    LocalEdgeCore_resolveTailnetSuffix(
      "auto",
      createProbeDependencies({
        existingCommands: [],
      }),
    ),
    "gannet-frog.ts.net",
  );
});
