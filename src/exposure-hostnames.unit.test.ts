/**
 * @fileoverview Verifies the plan-only `hostnames` exposure backend: compact names under one
 * wildcard, the rendered router config, the provided TLS folder check, the lego install, issue
 * and renewal steps (env names only), the wildcard DNS records, the raw-TCP Serve step, the
 * guards, and that apply always refuses.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames.unit.test.ts
 *
 * @see src/exposure-hostnames.ts - Backend under test.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { LocalEdgeCore_ExposureHostnamesConfig, LocalEdgeCore_ExposureManifest } from "./exposure.js";
import { LocalEdgeCore_renderExposurePlanText } from "./exposure.js";
import { LocalEdgeCore_createExposureBackend } from "./exposure-backends.js";
import {
  type LocalEdgeCore_PrivateDirProbe,
  LocalEdgeCore_buildExposureHostname,
  LocalEdgeCore_planExposureHostnames,
  LocalEdgeCore_renderExposureHostnamesNginxConfig,
  LocalEdgeCore_validateExposureHostnames,
} from "./exposure-hostnames.js";

const privateDirs: LocalEdgeCore_PrivateDirProbe = () => ({ exists: true, mode: 0o700, gitRoot: null });

const settings: LocalEdgeCore_ExposureHostnamesConfig = {
  projectMachineLabel: "proj-m1",
  rootZone: "example.test",
  realm: "main",
  routerHost: "127.0.0.1",
  routerPort: 8460,
  tls: { mode: "provided", certPath: "/le/tls/wildcard.crt", keyPath: "/le/tls/wildcard.key" },
  nginx: {
    confPath: "/le/nginx/nginx.conf",
    pidPath: "/le/nginx/nginx.pid",
    errorLogPath: "/le/logs/nginx-error.log",
    accessLogPath: "/le/logs/nginx-access.log",
    tempDir: "/le/nginx/tmp",
    mimeTypesPath: "/opt/nginx/mime.types",
  },
  acme: {
    client: "lego",
    dnsProvider: "vercel",
    dataDir: "/le/lego",
    keyType: "EC256",
    deployHook: "/le/bin/cert-deploy.sh",
    runScript: "/le/bin/cert-run.sh",
    renewal: "daily launch agent",
  },
  addresses: { ipv4: "100.64.0.9" },
};

function manifest(overrides: Partial<LocalEdgeCore_ExposureManifest> = {}): LocalEdgeCore_ExposureManifest {
  return {
    protectedPorts: [443, 8445],
    hostnames: settings,
    apps: [
      { id: "auth", edgeName: "auth-api", enabled: true, localPort: 4300 },
      { id: "web", edgeName: "web-rebuild", enabled: true, localPort: 3210 },
      { id: "later", enabled: false, localPort: 3300 },
    ],
    ...overrides,
  };
}

function plan(candidate = manifest()) {
  return LocalEdgeCore_planExposureHostnames(candidate, { inspectDir: privateDirs });
}

void test("names are <app>.<project-machine>.<zone> for main and <app>--<realm> otherwise", () => {
  assert.equal(LocalEdgeCore_buildExposureHostname(settings, "web-rebuild"), "web-rebuild.proj-m1.example.test");
  assert.equal(
    LocalEdgeCore_buildExposureHostname({ ...settings, realm: "Feat/Login" }, "web-rebuild"),
    "web-rebuild--feat-login.proj-m1.example.test",
  );
  assert.equal(
    LocalEdgeCore_buildExposureHostname({ ...settings, buildHostname: (p) => `${p.app}.x.${p.rootZone}` }, "a"),
    "a.x.example.test",
  );
});

void test("plans one server block per enabled app, then router, TLS, ACME, DNS and tailnet steps", () => {
  const actions = plan();
  assert.deepEqual(
    actions.map((a) => [a.appId, a.kind]),
    [
      ["auth", "manual"],
      ["web", "manual"],
      ["later", "skip"],
      ["router:nginx", "manual"],
      ["router:tls", "manual"],
      ["router:acme-install", "manual"],
      ["router:acme", "manual"],
      ["router:acme-renew", "manual"],
      ["router:dns", "manual"],
      ["router:tailnet", "manual"],
    ],
  );
  const web = actions[1];
  assert.equal(web?.edgeUrl, "https://web-rebuild.proj-m1.example.test:8460");
  assert.match(web?.detail ?? "", /listen 127\.0\.0\.1:8460 ssl;/);
  assert.match(web?.detail ?? "", /server_name web-rebuild\.proj-m1\.example\.test;/);
  assert.match(web?.detail ?? "", /proxy_pass http:\/\/127\.0\.0\.1:3210;/);
  assert.match(web?.detail ?? "", /X-Forwarded-Host \$host:8460;/);
  assert.match(web?.detail ?? "", /Connection \$local_edge_connection_upgrade;/);
});

void test("renders a whole nginx.conf with pid, logs, temp paths and the certificate from config", () => {
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest());
  assert.match(text, /^pid \/le\/nginx\/nginx\.pid;$/m);
  assert.match(text, /^error_log \/le\/logs\/nginx-error\.log warn;$/m);
  assert.match(text, /access_log \/le\/logs\/nginx-access\.log;/);
  assert.match(text, /client_body_temp_path \/le\/nginx\/tmp\/body;/);
  assert.match(text, /include \/opt\/nginx\/mime\.types;/);
  assert.match(text, /^ {2}ssl_certificate \/le\/tls\/wildcard\.crt;$/m);
  assert.match(text, /listen 127\.0\.0\.1:8460 ssl default_server; server_name _; return 421;/);
  assert.equal(text.match(/server_name [a-z]/g)?.length, 2);
  assert.ok(!text.includes("later"));
  assert.equal(text, LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest()));
  const noMime = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifest({ hostnames: { ...settings, nginx: { ...settings.nginx, mimeTypesPath: undefined } } }),
  );
  assert.ok(!noMime.includes("include"));
  assert.throws(() => LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest({ hostnames: undefined })));
});

void test("TLS step reports when the folder is not 0700 or sits in a git checkout", () => {
  const ok = plan().find((a) => a.appId === "router:tls");
  assert.match(ok?.reason ?? "", /0700 and outside git/);
  const bad = LocalEdgeCore_planExposureHostnames(manifest(), {
    inspectDir: () => ({ exists: true, mode: 0o755, gitRoot: "/repo" }),
  }).find((a) => a.appId === "router:tls");
  assert.match(bad?.reason ?? "", /mode 755, want 700/);
  assert.match(bad?.reason ?? "", /inside the git checkout \/repo/);
});

void test("ACME steps list install, issue and renewal with env names only", () => {
  const actions = plan();
  assert.deepEqual(actions.find((a) => a.appId === "router:acme-install")?.argv, ["brew", "install", "lego"]);
  const acme = actions.find((a) => a.appId === "router:acme");
  assert.deepEqual(acme?.argv, [
    "lego", "run", "--accept-tos", "--dns", "vercel", "--domains", "*.proj-m1.example.test",
    "--key-type", "EC256", "--path", "/le/lego", "--deploy-hook", "/le/bin/cert-deploy.sh",
  ]);
  assert.match(acme?.reason ?? "", /VERCEL_API_TOKEN, VERCEL_TEAM_ID/);
  assert.deepEqual(actions.find((a) => a.appId === "router:acme-renew")?.argv, ["/bin/sh", "/le/bin/cert-run.sh"]);
});

void test("DNS step lists the wildcard records, or a noop when the owner reports them live", () => {
  assert.equal(plan().find((a) => a.appId === "router:dns")?.detail, "*.proj-m1 A 100.64.0.9");
  const live = plan(manifest({ hostnames: { ...settings, dnsLive: true } })).find((a) => a.appId === "router:dns");
  assert.equal(live?.kind, "noop");
  const read = LocalEdgeCore_planExposureHostnames(manifest({ hostnames: { ...settings, addresses: undefined } }), {
    inspectDir: privateDirs,
    runner: () => ({ status: 0, stdout: JSON.stringify({ Self: { TailscaleIPs: ["100.64.0.7", "fd7a::7"] } }), stderr: "" }),
  }).find((a) => a.appId === "router:dns");
  assert.equal(read?.detail, "*.proj-m1 A 100.64.0.7\n*.proj-m1 AAAA fd7a::7");
});

void test("tailnet step is a raw TCP Serve mapping of the router port, and can be left out", () => {
  const tailnet = plan().find((a) => a.appId === "router:tailnet");
  assert.deepEqual(tailnet?.argv, ["tailscale", "serve", "--bg", "--tcp=8460", "tcp://127.0.0.1:8460"]);
  const off = plan(manifest({ hostnames: { ...settings, tailnetTcp: false } }));
  assert.ok(!off.some((a) => a.appId === "router:tailnet"));
});

void test("refuses protected or non-loopback routers, bad labels, duplicates and missing settings", () => {
  const cases: LocalEdgeCore_ExposureManifest[] = [
    manifest({ hostnames: { ...settings, routerPort: 8445 } }),
    manifest({ hostnames: { ...settings, routerHost: "0.0.0.0" } }),
    manifest({ hostnames: { ...settings, projectMachineLabel: "Proj M1" } }),
    manifest({ hostnames: { ...settings, tls: { ...settings.tls, certPath: "tls/c.crt" } } }),
    manifest({ hostnames: { ...settings, hostnameTemplate: "{label}.other.{rootZone}" } }),
    manifest({ hostnames: undefined }),
    manifest({ apps: [{ id: "clash", enabled: true, localPort: 8460 }] }),
    manifest({ apps: [{ id: "a--b", enabled: true, localPort: 3000 }] }),
    manifest({
      apps: [
        { id: "one", edgeName: "same", enabled: true, localPort: 3000 },
        { id: "two", edgeName: "same", enabled: true, localPort: 3001 },
      ],
    }),
  ];
  for (const candidate of cases) {
    const actions = plan(candidate);
    assert.equal(actions[0]?.kind, "refuse", JSON.stringify(candidate.hostnames ?? candidate.apps));
    assert.ok(!actions.some((a) => a.appId.startsWith("router:")));
  }
  assert.deepEqual(LocalEdgeCore_validateExposureHostnames(manifest()), []);
});

void test("backend is plan-only: apply and remove refuse even with --apply", () => {
  const backend = LocalEdgeCore_createExposureBackend("hostnames", {
    runner: () => ({ status: 1, stdout: "", stderr: "" }),
  });
  const built = backend.plan(manifest());
  assert.equal(built.applicable, false);
  assert.equal(built.hostname, "*.proj-m1.example.test");
  assert.match(LocalEdgeCore_renderExposurePlanText(built), /needs dns-tls-owner/);
  assert.equal(backend.apply(built, { apply: true }).ok, false);
  assert.equal(backend.remove(manifest(), { apply: true }).ok, false);
  assert.deepEqual(backend.status(manifest()).map((r) => r.state), ["unknown", "unknown", "disabled"]);
  assert.equal(backend.status(manifest())[0]?.edgeUrl, "https://auth-api.proj-m1.example.test:8460");
});

void test("status reports the Serve TCP mapping in front of the router as exposed, missing or conflict", () => {
  const withServe = (tcp: unknown) =>
    LocalEdgeCore_createExposureBackend("hostnames", {
      runner: () => ({ status: 0, stdout: JSON.stringify({ TCP: tcp }), stderr: "" }),
    }).status(manifest());
  const ok = withServe({ "8460": { TCPForward: "127.0.0.1:8460" }, "443": { HTTPS: true } });
  assert.deepEqual(ok.map((r) => r.state), ["exposed", "exposed", "disabled"]);
  assert.equal(ok[0]?.observedTarget, "tcp://127.0.0.1:8460");
  assert.deepEqual(withServe({}).map((r) => r.state), ["missing", "missing", "disabled"]);
  assert.equal(withServe({ "8460": { HTTPS: true } })[0]?.state, "conflict");
});

void test("extra path locations render after / with their own upstream paths, and bad ones refuse", () => {
  const withLocations = manifest({
    apps: [
      {
        id: "preview",
        enabled: true,
        localPort: 3100,
        locations: [
          { path: "/api/v1", localPort: 8000 },
          { path: "/files", localPort: 8000, upstreamPath: "/storage/v1" },
        ],
      },
    ],
  });
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(withLocations);
  assert.match(text, /location \/ \{\n {6}proxy_pass http:\/\/127\.0\.0\.1:3100;/);
  assert.match(text, /location \/api\/v1 \{\n {6}proxy_pass http:\/\/127\.0\.0\.1:8000\/api\/v1;/);
  assert.match(text, /location \/files \{\n {6}proxy_pass http:\/\/127\.0\.0\.1:8000\/storage\/v1;/);
  for (const locations of [[{ path: "/", localPort: 8000 }], [{ path: "x y", localPort: 8000 }], [{ path: "/a", localPort: 8460 }]]) {
    const actions = plan(manifest({ apps: [{ id: "preview", enabled: true, localPort: 3100, locations }] }));
    assert.equal(actions[0]?.kind, "refuse", JSON.stringify(locations));
  }
});
