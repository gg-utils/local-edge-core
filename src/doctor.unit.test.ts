/**
 * @fileoverview Verifies local-edge doctor-core helpers for registry summaries, render-artifact
 * lines, active-realm TLS wildcard collection, argv parsing, usage text, and workspace/realm
 * registration checks.
 *
 * This file owns regression coverage for the pure functions exported from `doctor.ts` that format
 * CLI-facing log lines and validate registry payloads without adapter-owned orchestration or host
 * probes.
 * Flow: build JSON fixtures or temp registry files -> invoke doctor helpers -> assert formatted
 * lines, structured verify results, and `LocalEdgeCoreDoctorError` parse failures.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/doctor.unit.test.ts
 *
 * @see packages/local-edge-core/src/doctor.ts - Doctor summarization, argv/usage parsing, TLS wildcard extraction, and workspace registration helpers whose contracts and log lines are asserted here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract this header follows for verification tooling and reviews.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX,
  LocalEdgeCoreDoctorError,
  LocalEdgeCore_doctorCollectActiveRealmTlsWildcards,
  LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine,
  LocalEdgeCore_doctorFormatRegistrySummaryLine,
  LocalEdgeCore_doctorFormatRenderArtifactLine,
  LocalEdgeCore_doctorParseArgv,
  LocalEdgeCore_doctorParseJsonText,
  LocalEdgeCore_doctorRealmValuesFromPayload,
  LocalEdgeCore_doctorRenderUsage,
  LocalEdgeCore_doctorSummarizeRegistryPayload,
  LocalEdgeCore_doctorSummarizeRenderArtifactPayload,
  LocalEdgeCore_doctorVerifyWorkspaceRegistration,
  LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload,
} from "./doctor.js";

test("LocalEdgeCore_doctorRenderUsage includes every supported doctor subcommand", () => {
  const usage = LocalEdgeCore_doctorRenderUsage();

  assert.match(usage, /^Usage: doctor-core\.ts <command> \[options\]/);
  assert.match(usage, /print-registry-line --path <registry\.json>/);
  assert.match(
    usage,
    /verify-root-workspace --registry <registry\.json> --workspace <dir> --realm <slug>/,
  );
  assert.match(usage, /print-render-line --path <render-last-run\.json>/);
  assert.match(usage, /print-tls-wildcards --path <registry\.json>/);
});

test("LocalEdgeCore_doctorParseArgv parses help aliases", () => {
  assert.deepEqual(LocalEdgeCore_doctorParseArgv([]), { command: "help" });
  assert.deepEqual(LocalEdgeCore_doctorParseArgv(["--help"]), {
    command: "help",
  });
  assert.deepEqual(LocalEdgeCore_doctorParseArgv(["-h"]), { command: "help" });
});

test("LocalEdgeCore_doctorParseArgv parses registry, render, TLS, and workspace commands", () => {
  assert.deepEqual(
    LocalEdgeCore_doctorParseArgv(["print-registry-line", "--path", "r.json"]),
    {
      command: "print-registry-line",
      registryPath: "r.json",
    },
  );
  assert.deepEqual(
    LocalEdgeCore_doctorParseArgv([
      "print-render-line",
      "--path",
      "render.json",
    ]),
    {
      command: "print-render-line",
      artifactPath: "render.json",
    },
  );
  assert.deepEqual(
    LocalEdgeCore_doctorParseArgv(["print-tls-wildcards", "--path", "r.json"]),
    {
      command: "print-tls-wildcards",
      registryPath: "r.json",
    },
  );
  assert.deepEqual(
    LocalEdgeCore_doctorParseArgv([
      "verify-root-workspace",
      "--registry",
      "r.json",
      "--workspace",
      "/repo",
      "--realm",
      "main",
    ]),
    {
      command: "verify-root-workspace",
      registryPath: "r.json",
      workspacePath: "/repo",
      realmSlug: "main",
    },
  );
});

test("LocalEdgeCore_doctorParseArgv preserves legacy missing-value and unknown-command errors", () => {
  assert.throws(
    () => LocalEdgeCore_doctorParseArgv(["print-registry-line"]),
    (error: unknown) =>
      error instanceof LocalEdgeCoreDoctorError &&
      error.message === "Missing value for --path",
  );
  assert.throws(
    () =>
      LocalEdgeCore_doctorParseArgv([
        "verify-root-workspace",
        "--registry",
        "r.json",
      ]),
    (error: unknown) =>
      error instanceof LocalEdgeCoreDoctorError &&
      error.message === "Missing value for --workspace",
  );
  assert.throws(
    () => LocalEdgeCore_doctorParseArgv(["unknown"]),
    (error: unknown) =>
      error instanceof LocalEdgeCoreDoctorError &&
      error.message === "Unknown command: unknown",
  );
});

test("LocalEdgeCore_doctorSummarizeRegistryPayload formats typical registry counts", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(`{
    "schemaVersion": 1,
    "realms": {
      "main": {
        "status": "active",
        "realmSlug": "main",
        "workspacePath": "/tmp/ws"
      },
      "wt1": {
        "status": "inactive",
        "realmSlug": "wt1",
        "workspacePath": "/tmp/wt"
      },
      "old": {
        "status": "stale",
        "realmSlug": "old",
        "workspacePath": "/tmp/old"
      }
    }
  }`);
  const summary = LocalEdgeCore_doctorSummarizeRegistryPayload(payload);

  assert.equal(
    LocalEdgeCore_doctorFormatRegistrySummaryLine(summary),
    `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Registry schema=1 realms=3 active=1 inactive=1 stale=1`,
  );
});

test("LocalEdgeCore_doctorSummarizeRegistryPayload preserves undefined schema coercion", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(`{}`);
  const summary = LocalEdgeCore_doctorSummarizeRegistryPayload(payload);

  assert.equal(summary.schemaVersionDisplay, "undefined");
  assert.equal(
    LocalEdgeCore_doctorFormatRegistrySummaryLine(summary),
    `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Registry schema=undefined realms=0 active=0 inactive=0 stale=0`,
  );
});

test("LocalEdgeCore_doctorRealmValuesFromPayload keeps Object.values array semantics", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(`{"realms":["skip"]}`);
  assert.deepEqual(LocalEdgeCore_doctorRealmValuesFromPayload(payload), [
    "skip",
  ]);
});

test("LocalEdgeCore_doctorSummarizeRenderArtifactPayload formats missing values", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(`{"generatedFiles":[]}`);
  const summary = LocalEdgeCore_doctorSummarizeRenderArtifactPayload(payload);

  assert.equal(
    LocalEdgeCore_doctorFormatRenderArtifactLine(summary),
    `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Render artifact runAt=unknown realms=none generatedFiles=0`,
  );
});

test("LocalEdgeCore_doctorSummarizeRenderArtifactPayload preserves blank runAt", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(
    `{"runAt":"","realms":["a"],"generatedFiles":["/x"]}`,
  );
  const summary = LocalEdgeCore_doctorSummarizeRenderArtifactPayload(payload);

  assert.equal(
    LocalEdgeCore_doctorFormatRenderArtifactLine(summary),
    `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Render artifact runAt= realms=a generatedFiles=1`,
  );
});

test("LocalEdgeCore_doctorCollectActiveRealmTlsWildcards emits only complete active rows", () => {
  const payload = LocalEdgeCore_doctorParseJsonText(`{
    "realms": {
      "a": {
        "status": "active",
        "realmSlug": "main",
        "primaryMethod": "nginx-docker",
        "developerSlug": "dev",
        "rootZone": "local.test"
      },
      "b": {
        "status": "inactive",
        "realmSlug": "x",
        "primaryMethod": "nginx-docker",
        "developerSlug": "dev",
        "rootZone": "local.test"
      },
      "c": {
        "status": "active",
        "realmSlug": "",
        "primaryMethod": "nginx-docker",
        "developerSlug": "dev",
        "rootZone": "local.test"
      }
    }
  }`);

  assert.deepEqual(
    LocalEdgeCore_doctorCollectActiveRealmTlsWildcards(payload),
    ["*.main.nginx-docker.dev.local.test"],
  );
});

test("LocalEdgeCore_doctorVerifyWorkspaceRegistration reports a missing registry", () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "local-edge-core-doctor-"),
  );
  try {
    const registryPath = path.join(tmpDir, "missing.json");
    const result = LocalEdgeCore_doctorVerifyWorkspaceRegistration({
      registryPath,
      workspacePath: "/proj",
      expectedRealmSlug: "main",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.exitCode, 1);
      assert.equal(result.kind, "registry_missing");
      assert.equal(
        result.stderrLine,
        `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} ERROR: Local session is active but registry is missing: ${registryPath}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine formats missing registry errors", () => {
  assert.equal(
    LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine(
      "/tmp/registry.json",
    ),
    `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} ERROR: Local session is active but registry is missing: /tmp/registry.json`,
  );
});

test("LocalEdgeCore_doctorVerifyWorkspaceRegistration reports not_registered", () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "local-edge-core-doctor-"),
  );
  try {
    const registryPath = path.join(tmpDir, "realms.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        realms: {
          other: {
            workspacePath: "/other",
            realmSlug: "other",
            status: "active",
          },
        },
      }),
      "utf8",
    );

    const result = LocalEdgeCore_doctorVerifyWorkspaceRegistration({
      registryPath,
      workspacePath: "/proj",
      expectedRealmSlug: "main",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.stderrLine,
        `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} ERROR: Active local session is missing root-workspace realm registration for workspace=/proj realm=main.`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload checks parsed registry payloads", () => {
  const payload = {
    schemaVersion: 1,
    realms: {
      main: {
        workspacePath: "/proj",
        realmSlug: "main",
        status: "active",
      },
    },
  };

  const result = LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload({
    registryPath: "/virtual/realms.json",
    workspacePath: "/proj",
    expectedRealmSlug: "main",
    payload,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.line,
      `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Root-workspace realm registration confirmed for realm=main.`,
    );
  }
});

test("LocalEdgeCore_doctorVerifyWorkspaceRegistration confirms a matching row", () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "local-edge-core-doctor-"),
  );
  try {
    const registryPath = path.join(tmpDir, "realms.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        realms: {
          main: {
            workspacePath: "/proj",
            realmSlug: "main",
            status: "active",
          },
        },
      }),
      "utf8",
    );

    const result = LocalEdgeCore_doctorVerifyWorkspaceRegistration({
      registryPath,
      workspacePath: "/proj",
      expectedRealmSlug: "main",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.line,
        `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Root-workspace realm registration confirmed for realm=main.`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
