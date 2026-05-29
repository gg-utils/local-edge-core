/**
 * @fileoverview Verifies `packages/local-edge-core` conditional `exports` resolve for representative
 * `@gg-utils/local-edge-core/*` subpath imports used as the Level A public API smoke surface.
 *
 * This file owns Node test regression coverage that each imported entrypoint loads and returns
 * stable shapes for CLI parsing, health keys, dnsmasq rendering, hostname joins, realm validation,
 * and nginx-docker router helpers.
 * Flow: construct minimal manifest or record inputs -> call imported `LocalEdgeCore_*` helpers ->
 * assert strings, booleans, and parsed fields match the contracts those modules publish.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/package-exports.unit.test.ts
 *
 * @see packages/local-edge-core/package.json - Canonical `exports` map whose subpath keys and file targets must stay aligned with the `@gg-utils/local-edge-core/*` imports exercised in this smoke test.
 * @see packages/local-edge-core/src/router/nginx-docker.ts - Router-side nginx and Docker argv helpers whose renderers and builders are imported here to prove the `./router/nginx-docker` export surface stays wired.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import test from "node:test";
import assert from "node:assert/strict";

import { LocalEdgeCore_parseCliArgs } from "@gg-utils/local-edge-core/cli";
import { LocalEdgeCore_healthProbeKey } from "@gg-utils/local-edge-core/health";
import { LocalEdgeCore_renderDnsmasqConfig } from "@gg-utils/local-edge-core/host-mutations";
import { LocalEdgeCore_buildHostnameFromParts } from "@gg-utils/local-edge-core/hostnames";
import type { LocalEdgeCore_Manifest } from "@gg-utils/local-edge-core/manifest";
import { LocalEdgeCore_validateRealmRecord } from "@gg-utils/local-edge-core/registry";
import {
  LocalEdgeCore_buildDockerInfoArgs,
  LocalEdgeCore_renderNginxServerBlock,
} from "@gg-utils/local-edge-core/router/nginx-docker";

test("package subpath exports expose the Level A public API surface", () => {
  const manifest: LocalEdgeCore_Manifest = {
    schemaVersion: 1,
    packageName: "demo",
    methods: ["nginx-docker"],
    surfaces: [],
    upstreams: [],
  };

  assert.equal(manifest.packageName, "demo");
  assert.equal(
    LocalEdgeCore_buildHostnameFromParts({
      surface: "www",
      realmSlug: "main",
      method: "nginx-docker",
      developerSlug: "dev",
      rootZone: "test.local",
    }),
    "www.main.nginx-docker.dev.test.local",
  );
  assert.deepEqual(LocalEdgeCore_buildDockerInfoArgs(), ["info"]);
  assert.match(
    LocalEdgeCore_renderNginxServerBlock({
      method: "nginx-docker",
      listenHost: "127.0.0.1",
      listenPort: 443,
      serverNames: ["www.main.nginx-docker.dev.test.local"],
      tls: {
        certPath: "/tmp/local-edge-cert.pem",
        keyPath: "/tmp/local-edge-key.pem",
      },
      surfaceHeader: "www",
      upstreamHost: "127.0.0.1",
      upstreamPort: 4011,
      variableName: "local_edge_upstream",
      websocketSafe: true,
      routerHealthPath: "/__local-edge/router-health",
      routerHealthBody: "ok",
    }),
    /server_name www\.main\.nginx-docker\.dev\.test\.local;/,
  );
  assert.match(
    LocalEdgeCore_renderDnsmasqConfig({
      port: "53535",
      listenAddress: "127.0.0.1",
      addressRules: [
        {
          method: "nginx-docker",
          developerSlug: "dev",
          rootZone: "test.local",
          ipAddress: "127.0.0.1",
        },
      ],
      logPath: "/tmp/local-edge-dnsmasq.log",
      defaultIpAddress: null,
    }),
    /address=\/.+test\.local\/127\.0\.0\.1/,
  );
  assert.equal(
    LocalEdgeCore_healthProbeKey({
      realmSlug: "main",
      method: "nginx-docker",
      surface: "www",
    }),
    "main::nginx-docker::www",
  );
  assert.equal(LocalEdgeCore_parseCliArgs(["--dry-run"]).dryRun, true);
  assert.equal(
    LocalEdgeCore_validateRealmRecord({
      schemaVersion: 2,
      realmSlug: "main",
      status: "active",
      method: "nginx-docker",
      hostnameParts: { developerSlug: "dev", rootZone: "test.local" },
      workspace: { type: "workspace", path: "/tmp/demo" },
      upstreams: {},
      artifactPaths: { realmRoot: "/tmp/demo/.local-edge" },
      timestamps: {
        createdAt: "2026-05-19T00:00:00.000Z",
        registeredAt: "2026-05-19T00:00:00.000Z",
        lastSeenAt: "2026-05-19T00:00:00.000Z",
      },
    }).realmSlug,
    "main",
  );
});
