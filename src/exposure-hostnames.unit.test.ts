/**
 * @fileoverview Verifies the plan-only `hostnames` exposure backend: host shape, SNI server
 * blocks on the router port, dnsmasq and resolver text, the mkcert or provided TLS step, the
 * raw-TCP Serve step, the guards, and that apply always refuses.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames.unit.test.ts
 *
 * @see src/exposure-hostnames.ts - Backend under test.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { LocalEdgeCore_ExposureHostnamesConfig, LocalEdgeCore_ExposureManifest } from "./exposure.js";
import { LocalEdgeCore_renderExposurePlanText } from "./exposure.js";
import { LocalEdgeCore_createExposureBackend } from "./exposure-backends.js";
import {
  LocalEdgeCore_buildExposureHostname,
  LocalEdgeCore_planExposureHostnames,
} from "./exposure-hostnames.js";
import { LocalEdgeCore_buildMkcertArgv } from "./tls.js";

const settings: LocalEdgeCore_ExposureHostnamesConfig = {
  realm: "main",
  method: "nginx",
  machine: "m3",
  rootZone: "example.internal",
  routerHost: "127.0.0.1",
  routerPort: 8460,
  tls: { mode: "mkcert", certDir: "/certs" },
  dns: { listenAddress: "127.0.0.1", port: 53535, resolverDir: "/etc/resolver", logPath: "/logs/dnsmasq.log" },
};

function manifest(overrides: Partial<LocalEdgeCore_ExposureManifest> = {}): LocalEdgeCore_ExposureManifest {
  return {
    protectedPorts: [443, 8445],
    hostnames: settings,
    apps: [
      { id: "auth", enabled: true, localPort: 4300 },
      { id: "fellow-rebuild", enabled: true, localPort: 3210 },
      { id: "later", enabled: false, localPort: 3300 },
    ],
    ...overrides,
  };
}

void test("hosts follow surface.realm.method.machine.rootZone", () => {
  assert.equal(LocalEdgeCore_buildExposureHostname(settings, "fellow-rebuild"), "fellow-rebuild.main.nginx.m3.example.internal");
});

void test("plans one SNI server block per enabled app on the loopback router port", () => {
  const actions = LocalEdgeCore_planExposureHostnames(manifest());
  assert.deepEqual(
    actions.map((a) => [a.appId, a.kind]),
    [
      ["auth", "manual"],
      ["fellow-rebuild", "manual"],
      ["later", "skip"],
      ["router:dns", "manual"],
      ["router:tls", "manual"],
      ["router:tailnet", "manual"],
    ],
  );
  const fellow = actions[1];
  assert.equal(fellow?.edgeUrl, "https://fellow-rebuild.main.nginx.m3.example.internal:8460");
  assert.match(fellow?.detail ?? "", /listen 127\.0\.0\.1:8460 ssl;/);
  assert.match(fellow?.detail ?? "", /server_name fellow-rebuild\.main\.nginx\.m3\.example\.internal;/);
  assert.match(fellow?.detail ?? "", /127\.0\.0\.1:3210/);
  assert.match(fellow?.detail ?? "", /ssl_certificate \/certs\/main\.nginx\.m3\.example\.internal\.pem;/);
});

void test("DNS step renders the dnsmasq rule and the macOS resolver file", () => {
  const dns = LocalEdgeCore_planExposureHostnames(manifest()).find((a) => a.appId === "router:dns");
  assert.match(dns?.detail ?? "", /address=\/\.nginx\.m3\.example\.internal\/127\.0\.0\.1/);
  assert.match(dns?.detail ?? "", /listen-address=127\.0\.0\.1/);
  assert.match(dns?.detail ?? "", /# \/etc\/resolver\/example\.internal/);
  assert.match(dns?.detail ?? "", /nameserver 127\.0\.0\.1\nport 53535/);
  assert.equal(dns?.requires, "dns-tls-owner");
});

void test("TLS step is an mkcert wildcard per realm, or the provided pair", () => {
  const tls = LocalEdgeCore_planExposureHostnames(manifest()).find((a) => a.appId === "router:tls");
  assert.deepEqual(tls?.argv, [
    "mkcert",
    "-cert-file",
    "/certs/main.nginx.m3.example.internal.pem",
    "-key-file",
    "/certs/main.nginx.m3.example.internal-key.pem",
    "*.main.nginx.m3.example.internal",
  ]);
  const provided = LocalEdgeCore_planExposureHostnames(
    manifest({ hostnames: { ...settings, tls: { mode: "provided", certPath: "/p/c.pem", keyPath: "/p/k.pem" } } }),
  );
  const step = provided.find((a) => a.appId === "router:tls");
  assert.equal(step?.argv, undefined);
  assert.match(step?.detail ?? "", /cert: \/p\/c\.pem/);
  assert.match(provided[0]?.detail ?? "", /ssl_certificate \/p\/c\.pem;/);
});

void test("tailnet step is a raw TCP Serve mapping of the router port, and can be left out", () => {
  const tailnet = LocalEdgeCore_planExposureHostnames(manifest()).find((a) => a.appId === "router:tailnet");
  assert.deepEqual(tailnet?.argv, ["tailscale", "serve", "--tcp=8460", "tcp://127.0.0.1:8460"]);
  assert.equal(tailnet?.requires, "tailnet-admin");
  const off = LocalEdgeCore_planExposureHostnames(manifest({ hostnames: { ...settings, tailnetTcp: false } }));
  assert.ok(!off.some((a) => a.appId === "router:tailnet"));
});

void test("refuses a protected router port, a non-loopback router, bad labels and missing settings", () => {
  const cases: LocalEdgeCore_ExposureManifest[] = [
    manifest({ hostnames: { ...settings, routerPort: 8445 } }),
    manifest({ hostnames: { ...settings, routerHost: "0.0.0.0" } }),
    manifest({ hostnames: { ...settings, machine: "M3 Ultra" } }),
    manifest({ hostnames: undefined }),
    manifest({ apps: [{ id: "clash", enabled: true, localPort: 8460 }] }),
  ];
  for (const candidate of cases) {
    const actions = LocalEdgeCore_planExposureHostnames(candidate);
    assert.equal(actions[0]?.kind, "refuse", JSON.stringify(candidate.hostnames));
    assert.ok(!actions.some((a) => a.appId.startsWith("router:")));
  }
});

void test("backend is plan-only: apply and remove refuse even with --apply", () => {
  const backend = LocalEdgeCore_createExposureBackend("hostnames");
  const plan = backend.plan(manifest());
  assert.equal(plan.applicable, false);
  assert.equal(plan.hostname, "*.main.nginx.m3.example.internal");
  assert.match(LocalEdgeCore_renderExposurePlanText(plan), /needs tailnet-admin/);
  assert.equal(backend.apply(plan, { apply: true }).ok, false);
  assert.equal(backend.remove(manifest(), { apply: true }).ok, false);
  assert.deepEqual(backend.status(manifest()).map((r) => r.state), ["unknown", "unknown", "disabled"]);
  assert.equal(backend.status(manifest())[0]?.edgeUrl, "https://auth.main.nginx.m3.example.internal:8460");
});

void test("mkcert argv builder matches what the generator runs", () => {
  assert.deepEqual(LocalEdgeCore_buildMkcertArgv({ certPath: "c", keyPath: "k", hostnames: ["a", "b"] }), [
    "mkcert", "-cert-file", "c", "-key-file", "k", "a", "b",
  ]);
});
