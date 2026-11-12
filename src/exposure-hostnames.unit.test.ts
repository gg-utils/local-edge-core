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

import type {
  LocalEdgeCore_ExposureHostnamesConfig,
  LocalEdgeCore_ExposureManifest,
  LocalEdgeCore_ExposureStreamRouter,
} from "./exposure.js";
import { LocalEdgeCore_renderExposurePlanText } from "./exposure.js";
import { LocalEdgeCore_createExposureBackend } from "./exposure-backends.js";
import {
  type LocalEdgeCore_PrivateDirProbe,
  LocalEdgeCore_buildExposureHostname,
  LocalEdgeCore_nginxPathArgument,
  LocalEdgeCore_planExposureHostnames,
  LocalEdgeCore_renderExposureHostnamesNginxConfig,
  LocalEdgeCore_sniZoneSuffixPattern,
  LocalEdgeCore_validateExposureHostnames,
} from "./exposure-hostnames.js";

const privateDirs: LocalEdgeCore_PrivateDirProbe = () => ({ exists: true, mode: 0o700, gitRoot: null });

const settings: LocalEdgeCore_ExposureHostnamesConfig = {
  projectMachineLabel: "proj-node1",
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
  addresses: { ipv4: "192.0.2.9" },
};

function manifest(overrides: Partial<LocalEdgeCore_ExposureManifest> = {}): LocalEdgeCore_ExposureManifest {
  return {
    protectedPorts: [443, 8445],
    hostnames: settings,
    apps: [
      { id: "auth", edgeName: "auth-api", enabled: true, localPort: 4300 },
      { id: "web", edgeName: "web-app", enabled: true, localPort: 3210 },
      { id: "later", enabled: false, localPort: 3300 },
    ],
    ...overrides,
  };
}

function plan(candidate = manifest()) {
  return LocalEdgeCore_planExposureHostnames(candidate, { inspectDir: privateDirs });
}

void test("names are <app>.<project-machine>.<zone> for main and <app>--<realm> otherwise", () => {
  assert.equal(LocalEdgeCore_buildExposureHostname(settings, "web-app"), "web-app.proj-node1.example.test");
  assert.equal(
    LocalEdgeCore_buildExposureHostname({ ...settings, realm: "Feat/Login" }, "web-app"),
    "web-app--feat-login.proj-node1.example.test",
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
  assert.equal(web?.edgeUrl, "https://web-app.proj-node1.example.test:8460");
  assert.match(web?.detail ?? "", /listen 127\.0\.0\.1:8460 ssl;/);
  assert.match(web?.detail ?? "", /server_name web-app\.proj-node1\.example\.test;/);
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
    "lego", "run", "--accept-tos", "--dns", "vercel", "--domains", "*.proj-node1.example.test",
    "--key-type", "EC256", "--path", "/le/lego", "--deploy-hook", "/le/bin/cert-deploy.sh",
  ]);
  assert.match(acme?.reason ?? "", /VERCEL_API_TOKEN, VERCEL_TEAM_ID/);
  assert.deepEqual(actions.find((a) => a.appId === "router:acme-renew")?.argv, ["/bin/sh", "/le/bin/cert-run.sh"]);
});

void test("DNS step lists the wildcard records, or a noop when the owner reports them live", () => {
  assert.equal(plan().find((a) => a.appId === "router:dns")?.detail, "*.proj-node1 A 192.0.2.9");
  const live = plan(manifest({ hostnames: { ...settings, dnsLive: true } })).find((a) => a.appId === "router:dns");
  assert.equal(live?.kind, "noop");
  const read = LocalEdgeCore_planExposureHostnames(manifest({ hostnames: { ...settings, addresses: undefined } }), {
    inspectDir: privateDirs,
    runner: () => ({ status: 0, stdout: JSON.stringify({ Self: { TailscaleIPs: ["192.0.2.7", "2001:db8::7"] } }), stderr: "" }),
  }).find((a) => a.appId === "router:dns");
  assert.equal(read?.detail, "*.proj-node1 A 192.0.2.7\n*.proj-node1 AAAA 2001:db8::7");
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
  assert.equal(built.hostname, "*.proj-node1.example.test");
  assert.match(LocalEdgeCore_renderExposurePlanText(built), /needs dns-tls-owner/);
  assert.equal(backend.apply(built, { apply: true }).ok, false);
  assert.equal(backend.remove(manifest(), { apply: true }).ok, false);
  assert.deepEqual(backend.status(manifest()).map((r) => r.state), ["unknown", "unknown", "disabled"]);
  assert.equal(backend.status(manifest())[0]?.edgeUrl, "https://auth-api.proj-node1.example.test:8460");
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

void test("hostnames: router listeners are a list; each gets the 421 default and every host", () => {
  const listeners = [{ port: 8460 }, { port: 8461, clientPort: 443 }];
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifest({ hostnames: { ...settings, edgePort: 8460, listeners } }),
  );
  assert.match(
    text,
    /server \{ listen 127\.0\.0\.1:8460 ssl default_server; listen 127\.0\.0\.1:8461 ssl default_server; server_name _; return 421; \}/,
  );
  const hostBlocks = text.split("\n    server_name ").length - 1;
  assert.equal(hostBlocks, 2);
  assert.equal(text.split("    listen 127.0.0.1:8460 ssl;\n    listen 127.0.0.1:8461 ssl;").length - 1, hostBlocks);
  assert.match(text, /map \$server_port \$local_edge_forwarded_host \{\n {4}8460 \$host:8460;\n {4}8461 \$host;\n {2}\}/);
  assert.match(text, /map \$server_port \$local_edge_forwarded_port \{\n {4}8460 8460;\n {4}8461 443;\n {2}\}/);
  assert.match(text, /X-Forwarded-Host \$local_edge_forwarded_host;\n {6}proxy_set_header X-Forwarded-Port \$local_edge_forwarded_port;/);

  const single = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifest({ hostnames: { ...settings, edgePort: 8460, listeners: [{ port: 8460 }] } }),
  );
  assert.equal(single, LocalEdgeCore_renderExposureHostnamesNginxConfig(manifest({ hostnames: { ...settings, edgePort: 8460 } })));
  assert.doesNotMatch(single, /local_edge_forwarded/);
  assert.match(single, /X-Forwarded-Host \$host:8460;\n {6}proxy_set_header X-Forwarded-Port 8460;/);
  const plain = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifest({ hostnames: { ...settings, listeners: [{ port: 8460 }, { port: 8461, ssl: false }] } }),
  );
  assert.match(plain, /listen 127\.0\.0\.1:8461 default_server;/);
});

void test("hostnames: listener list guards", () => {
  const problems = (listeners: LocalEdgeCore_ExposureHostnamesConfig["listeners"]) =>
    LocalEdgeCore_validateExposureHostnames(manifest({ hostnames: { ...settings, listeners } })).join("\n");
  assert.match(problems([{ port: 8461 }]), /must include routerPort 8460/);
  assert.match(problems([{ port: 8460 }, { port: 8460 }]), /listed twice/);
  assert.match(problems([{ port: 8460 }, { port: 8445 }]), /8445 is protected/);
  assert.match(problems([{ port: 8460 }, { port: 3210 }]), /also an app port/);
  assert.match(problems([{ port: 8460 }, { port: 70000 }]), /not a valid TCP port/);
  assert.match(problems([{ port: 8460, clientPort: 0 }]), /invalid clientPort/);
  assert.equal(problems([{ port: 8460 }, { port: 8461, clientPort: 443 }]), "");
});

void test("hostnames: SNI stream router renders before http and is planned, never applied", () => {
  assert.equal(LocalEdgeCore_sniZoneSuffixPattern("example.test"), "~\\.example\\.test$");
  const stream: LocalEdgeCore_ExposureStreamRouter = {
    port: 8462,
    routes: [{ serverName: LocalEdgeCore_sniZoneSuffixPattern("example.test"), upstream: "127.0.0.1:8461" }],
    defaultUpstream: "192.0.2.9:8452",
  };
  const withStream = manifest({
    hostnames: { ...settings, listeners: [{ port: 8460 }, { port: 8461, clientPort: 443 }], stream },
  });
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(withStream);
  assert.ok(text.indexOf("stream {") < text.indexOf("http {"));
  assert.ok(
    text.includes(`stream {
  map $ssl_preread_server_name $local_edge_stream_upstream {
    ~\\.example\\.test$ 127.0.0.1:8461;
    default 192.0.2.9:8452;
  }
  server {
    listen 127.0.0.1:8462;
    ssl_preread on;
    proxy_pass $local_edge_stream_upstream;
    proxy_connect_timeout 5s;
  }
}`),
  );
  const step = plan(withStream).find((action) => action.appId === "router:stream");
  assert.equal(step?.kind, "manual");
  assert.equal(step?.argv, undefined);

  const problems = (patch: Partial<LocalEdgeCore_ExposureStreamRouter>) =>
    LocalEdgeCore_validateExposureHostnames(
      manifest({ hostnames: { ...settings, listeners: [{ port: 8460 }, { port: 8461 }], stream: { ...stream, ...patch } } }),
    ).join("\n");
  assert.equal(problems({}), "");
  assert.match(problems({ port: 8461 }), /also an HTTP listener/);
  assert.match(problems({ port: 8445 }), /is protected/);
  assert.match(problems({ defaultUpstream: "nowhere" }), /must be host:port/);
  assert.match(problems({ defaultUpstream: "127.0.0.1:8462" }), /points back at the stream listener/);
  assert.match(problems({ routes: [{ serverName: "a b", upstream: "127.0.0.1:8461" }] }), /not a usable map key/);
  assert.match(problems({ connectTimeout: "soon" }), /not an nginx time/);
});

void test("hostnames: an app may use its own pattern under an extra wildcard", () => {
  const hostnames = { ...settings, extraWildcardTemplates: ["*.node1.{rootZone}"] };
  const withDash = manifest({
    hostnames,
    apps: [
      { id: "web", edgeName: "web-app", enabled: true, localPort: 3210 },
      { id: "dash", enabled: true, localPort: 3081, hostnameTemplate: "{label}.node1.{rootZone}" },
    ],
  });
  assert.deepEqual(LocalEdgeCore_validateExposureHostnames(withDash), []);
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(withDash);
  assert.match(text, /server_name dash\.node1\.example\.test;/);
  assert.match(text, /server_name web-app\.proj-node1\.example\.test;/);
  const actions = plan(withDash);
  assert.deepEqual(
    actions.find((action) => action.appId === "dash")?.edgeUrl,
    "https://dash.node1.example.test:8460",
  );
  const acme = actions.find((action) => action.appId === "router:acme")?.argv ?? [];
  assert.ok(acme.includes("*.proj-node1.example.test") && acme.includes("*.node1.example.test"));
  assert.match(actions.find((action) => action.appId === "router:dns")?.detail ?? "", /\*\.proj-node1 A 192\.0\.2\.9\n\*\.node1 A 192\.0\.2\.9/);

  const stray = manifest({
    hostnames: settings,
    apps: [{ id: "dash", enabled: true, localPort: 3081, hostnameTemplate: "{label}.node1.{rootZone}" }],
  });
  assert.match(LocalEdgeCore_validateExposureHostnames(stray).join("\n"), /not directly under \*\.proj-node1\.example\.test/);
  assert.match(
    LocalEdgeCore_validateExposureHostnames(manifest({ hostnames: { ...settings, extraWildcardTemplates: ["*.other.zone"] } })).join("\n"),
    /must be \*\.<label>\.example\.test/,
  );
});

void test("hostnames: every rendered path field refuses characters nginx reads as syntax", () => {
  const bad = ["/x;\nuser root", "/x y", "/x\ty", '/x"q', "/x'q", "/x{", "/x}", "/x#c", "/x$v", "/x\\y", "/x\u0000y", "/x\ry", "relative/x"];
  const fields: [string, (value: string) => LocalEdgeCore_ExposureHostnamesConfig][] = [
    ["tls.certPath", (v) => ({ ...settings, tls: { ...settings.tls, certPath: v } })],
    ["tls.keyPath", (v) => ({ ...settings, tls: { ...settings.tls, keyPath: v } })],
    ["nginx.confPath", (v) => ({ ...settings, nginx: { ...settings.nginx, confPath: v } })],
    ["nginx.pidPath", (v) => ({ ...settings, nginx: { ...settings.nginx, pidPath: v } })],
    ["nginx.errorLogPath", (v) => ({ ...settings, nginx: { ...settings.nginx, errorLogPath: v } })],
    ["nginx.accessLogPath", (v) => ({ ...settings, nginx: { ...settings.nginx, accessLogPath: v } })],
    ["nginx.tempDir", (v) => ({ ...settings, nginx: { ...settings.nginx, tempDir: v } })],
    ["nginx.mimeTypesPath", (v) => ({ ...settings, nginx: { ...settings.nginx, mimeTypesPath: v } })],
    ["acme.dataDir", (v) => ({ ...settings, acme: { ...settings.acme!, dataDir: v } })],
  ];
  for (const [field, patch] of fields) {
    for (const value of bad) {
      const candidate = manifest({ hostnames: patch(value) });
      const problems = LocalEdgeCore_validateExposureHostnames(candidate).join("\n");
      assert.match(problems, new RegExp(`hostnames\\.${field.replace(".", "\\.")}`), `${field} ${JSON.stringify(value)}`);
      assert.equal(plan(candidate)[0]?.kind, "refuse");
      assert.throws(() => LocalEdgeCore_renderExposureHostnamesNginxConfig(candidate), /invalid/);
    }
  }
  for (const value of bad) {
    assert.throws(() => LocalEdgeCore_nginxPathArgument("hostnames.nginx.pidPath", value), /unsafe-path/);
  }
  assert.equal(LocalEdgeCore_nginxPathArgument("hostnames.nginx.pidPath", "/srv/edge/nginx.pid"), "/srv/edge/nginx.pid");
});

void test("hostnames: the client edge port is range-checked and refused when protected", () => {
  for (const edgePort of [8445, 443, 0, -1, 70000, 1.5, "8470" as unknown as number]) {
    const candidate = manifest({ hostnames: { ...settings, edgePort } });
    assert.match(LocalEdgeCore_validateExposureHostnames(candidate).join("\n"), /hostnames\.edgePort/, String(edgePort));
    const actions = plan(candidate);
    assert.equal(actions[0]?.kind, "refuse");
    assert.ok(!actions.some((a) => a.appId === "router:tailnet"));
  }
  const ok = plan(manifest({ hostnames: { ...settings, edgePort: 8470 } }));
  assert.deepEqual(ok.find((a) => a.appId === "router:tailnet")?.argv, ["tailscale", "serve", "--bg", "--tcp=8470", "tcp://127.0.0.1:8460"]);
});

void test("hostnames: worker_connections must be a positive integer", () => {
  for (const workerConnections of [0, 1.5, "512; user root" as unknown as number]) {
    const candidate = manifest({ hostnames: { ...settings, nginx: { ...settings.nginx, workerConnections } } });
    assert.match(LocalEdgeCore_validateExposureHostnames(candidate).join("\n"), /workerConnections/);
  }
});

void test("hostnames: unsafe edge names are refused before any config is rendered", () => {
  for (const edgeName of ["auth;\n  return 200 x", "a.b", "Auth", "a b"]) {
    const candidate = manifest({ apps: [{ id: "auth", edgeName, enabled: true, localPort: 4300 }] });
    const actions = plan(candidate);
    assert.equal(actions[0]?.kind, "refuse", edgeName);
    assert.equal(actions[0]?.detail, undefined);
    assert.throws(() => LocalEdgeCore_renderExposureHostnamesNginxConfig(candidate), /invalid/);
  }
});

void test("hostnames: names longer than 253 characters are refused", () => {
  const zone = (length: number) => `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 63 * 3 - 3)}`;
  const fits = manifest({
    hostnames: { ...settings, rootZone: zone(253 - "auth-api.proj-node1.".length) },
    apps: [{ id: "auth", edgeName: "auth-api", enabled: true, localPort: 4300 }],
  });
  assert.deepEqual(LocalEdgeCore_validateExposureHostnames(fits), []);
  const tooLong = manifest({
    hostnames: { ...settings, rootZone: zone(254 - "auth-api.proj-node1.".length) },
    apps: [{ id: "auth", edgeName: "auth-api", enabled: true, localPort: 4300 }],
  });
  assert.match(LocalEdgeCore_validateExposureHostnames(tooLong).join("\n"), /longer than 253/);
});

void test("hostnames: two-character apps work in main and get a clear error in other realms", () => {
  assert.deepEqual(
    LocalEdgeCore_validateExposureHostnames(manifest({ apps: [{ id: "ab", enabled: true, localPort: 3000 }] })),
    [],
  );
  const other = manifest({
    hostnames: { ...settings, realm: "pr-7" },
    apps: [
      { id: "a", enabled: true, localPort: 3000 },
      { id: "ab", enabled: true, localPort: 3001 },
      { id: "abc", enabled: true, localPort: 3002 },
    ],
  });
  const problems = LocalEdgeCore_validateExposureHostnames(other);
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", /^ab: local-edge-core-hostname-short-app: .*edgeName/);
});
