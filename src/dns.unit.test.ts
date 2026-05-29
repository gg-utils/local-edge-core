/**
 * @fileoverview Verifies pure DNS helpers for dnsmasq config rendering, macOS resolver file
 * formatting and parsing, loopback alias collection, resolver path normalization, dns-audit CLI
 * argv parsing, and dns-audit state plus artifact line rendering.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_*` exports from `dns.js`,
 * including stable string templates, parse precedence, and structured failure reporting used by
 * local-edge dns-audit flows.
 * Flow: build representative options or argv -> invoke helpers -> assert rendered strings, parsed
 * fields, or structured pass/fail/summary state.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/dns.unit.test.ts
 *
 * @see packages/local-edge-core/src/dns.ts - Dnsmasq, resolver, and dns-audit pure functions under test whose outputs and parse results are asserted in this module.
 * @see packages/local-edge-kit/src/dns-audit-cli.ts - Kit dns-audit command surface that wires argv into `LocalEdgeCore_parseDnsAuditCliArgs` and prints audit lines built from the helpers verified here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_collectRequiredLoopbackAliases,
  LocalEdgeCore_createDnsAuditState,
  LocalEdgeCore_formatDnsAuditPassLine,
  LocalEdgeCore_formatDnsAuditSummaryLine,
  LocalEdgeCore_formatDnsAuditWarningLine,
  LocalEdgeCore_parseMacosResolverContent,
  LocalEdgeCore_parseDnsAuditCliArgs,
  LocalEdgeCore_recordDnsAuditFailure,
  LocalEdgeCore_recordDnsAuditPass,
  LocalEdgeCore_renderDnsAuditArtifact,
  LocalEdgeCore_renderDnsmasqConfig,
  LocalEdgeCore_renderMacosResolverContent,
  LocalEdgeCore_resolveMacosResolverPath,
} from "./dns.js";

test("LocalEdgeCore_renderDnsmasqConfig renders method wildcard rules", () => {
  assert.equal(
    LocalEdgeCore_renderDnsmasqConfig({
      port: "53535",
      listenAddress: "127.0.0.1",
      addressRules: [
        {
          method: "nginx-docker",
          developerSlug: "giaco-main",
          rootZone: "local.example.test",
          ipAddress: "127.0.0.3",
        },
      ],
      logPath: "/tmp/dnsmasq.log",
      defaultIpAddress: "127.0.0.9",
    }),
    `port=53535
listen-address=127.0.0.1
bind-interfaces
address=/.nginx-docker.giaco-main.local.example.test/127.0.0.3
log-queries
log-facility=/tmp/dnsmasq.log
address=/.local.example.test/127.0.0.9
`,
  );
});

test("LocalEdgeCore_renderMacosResolverContent renders resolver directives", () => {
  assert.equal(
    LocalEdgeCore_renderMacosResolverContent({
      nameserver: "127.0.0.1",
      port: "53535",
      timeoutSeconds: 2,
      searchOrder: 1,
    }),
    `nameserver 127.0.0.1
port 53535
timeout 2
search_order 1
`,
  );
});

test("LocalEdgeCore_parseMacosResolverContent extracts first nameserver and port", () => {
  assert.deepEqual(
    LocalEdgeCore_parseMacosResolverContent(`
# comment
nameserver 127.0.0.1
port 53535
nameserver 127.0.0.2
port 9999
`),
    { nameserver: "127.0.0.1", port: "53535" },
  );
});

test("LocalEdgeCore_collectRequiredLoopbackAliases returns unique non-default 127 aliases", () => {
  assert.deepEqual(
    LocalEdgeCore_collectRequiredLoopbackAliases({
      listenHosts: [
        "127.0.0.1",
        "127.0.0.3",
        "0.0.0.0",
        "localhost",
        "127.0.0.3",
        "127.0.0.4",
      ],
    }),
    ["127.0.0.3", "127.0.0.4"],
  );
});

test("LocalEdgeCore_resolveMacosResolverPath trims trailing resolver dir slashes", () => {
  assert.equal(
    LocalEdgeCore_resolveMacosResolverPath({
      resolverDir: "/etc/resolver///",
      rootZone: "local.example.test",
    }),
    "/etc/resolver/local.example.test",
  );
});

test("LocalEdgeCore_parseDnsAuditCliArgs parses method and strict flags", () => {
  assert.deepEqual(
    LocalEdgeCore_parseDnsAuditCliArgs({
      args: ["--method", "nginx-docker", "--strict", "--skip-direct-probe"],
      defaultMethod: "nginx-docker",
      defaultStrict: false,
      supportedMethods: ["nginx-docker"],
    }),
    {
      ok: true,
      options: {
        method: "nginx-docker",
        strict: true,
        runDirectDnsProbe: false,
      },
    },
  );
});

test("LocalEdgeCore_parseDnsAuditCliArgs reports unsupported flags and methods", () => {
  assert.deepEqual(
    LocalEdgeCore_parseDnsAuditCliArgs({
      args: ["--method", "other"],
      defaultMethod: "nginx-docker",
      defaultStrict: false,
      supportedMethods: ["nginx-docker"],
    }),
    {
      ok: false,
      message: "[local-edge:dns-audit] Unsupported --method 'other'.",
      exitCode: 2,
    },
  );

  assert.deepEqual(
    LocalEdgeCore_parseDnsAuditCliArgs({
      args: ["--unknown"],
      defaultMethod: "nginx-docker",
      defaultStrict: false,
      supportedMethods: ["nginx-docker"],
    }),
    {
      ok: false,
      message: "[local-edge:dns-audit] Unknown option: --unknown",
      exitCode: 2,
    },
  );
});

test("LocalEdgeCore DNS audit state helpers format lines and artifact content", () => {
  const state = LocalEdgeCore_createDnsAuditState();
  LocalEdgeCore_recordDnsAuditPass(state);
  LocalEdgeCore_recordDnsAuditFailure({
    state,
    label: "resolver.file.exists",
    detail: "missing resolver",
  });

  assert.deepEqual(state, {
    checkTotal: 2,
    checkPassed: 1,
    checkFailed: 1,
    failures: ["resolver.file.exists: missing resolver"],
  });
  assert.equal(
    LocalEdgeCore_formatDnsAuditPassLine("resolver.port"),
    "[local-edge:dns-audit] OK resolver.port",
  );
  assert.equal(
    LocalEdgeCore_formatDnsAuditWarningLine({
      label: "resolver.file.exists",
      detail: "missing resolver",
    }),
    "[local-edge:dns-audit] WARNING resolver.file.exists missing resolver",
  );
  assert.equal(
    LocalEdgeCore_formatDnsAuditSummaryLine(state),
    "[local-edge:dns-audit] Summary checksPassed=1/2 checksFailed=1",
  );
  assert.equal(
    LocalEdgeCore_renderDnsAuditArtifact({
      state,
      runAtIso: "2026-05-19T00:00:00Z",
      method: "nginx-docker",
      strict: false,
      resolverPath: "/etc/resolver/local.example.test",
      expectedNameserver: "127.0.0.1",
      expectedPort: "53535",
    }),
    `runAt=2026-05-19T00:00:00Z
method=nginx-docker
strict=false
resolverPath=/etc/resolver/local.example.test
resolverNameserverExpected=127.0.0.1
resolverPortExpected=53535
checksTotal=2
checksPassed=1
checksFailed=1
status=failed
failures<<EOF
resolver.file.exists: missing resolver
EOF
`,
  );
});
