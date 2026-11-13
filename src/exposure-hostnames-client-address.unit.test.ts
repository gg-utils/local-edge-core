/**
 * @fileoverview Verifies the client address headers, the address-free access log and the
 * `clientAddress: "proxy-protocol"` render of the `hostnames` backend: exact header lines in every
 * proxied location, existing listeners left as they are, the added PROXY protocol listeners,
 * option validation, the `error_log` level, and `nginx -t` on both renders when this nginx has the
 * stream modules.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames-client-address.unit.test.ts
 *
 * @see src/exposure-hostnames.ts - Render and validation under test.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  LocalEdgeCore_ExposureHostnamesConfig,
  LocalEdgeCore_ExposureManifest,
  LocalEdgeCore_ExposureProxyProtocolPorts,
} from "./exposure.js";
import {
  LocalEdgeCore_renderExposureHostnamesNginxConfig,
  LocalEdgeCore_sniZoneSuffixPattern,
  LocalEdgeCore_validateExposureHostnames,
} from "./exposure-hostnames.js";

const baseSettings: LocalEdgeCore_ExposureHostnamesConfig = {
  projectMachineLabel: "proj-node1",
  rootZone: "example.test",
  realm: "main",
  routerHost: "127.0.0.1",
  routerPort: 8460,
  listeners: [{ port: 8460 }, { port: 8461, clientPort: 443 }],
  stream: {
    port: 8462,
    routes: [{ serverName: LocalEdgeCore_sniZoneSuffixPattern("example.test"), upstream: "127.0.0.1:8461" }],
    defaultUpstream: "192.0.2.9:8452",
  },
  tls: { mode: "provided", certPath: "/le/tls/wildcard.crt", keyPath: "/le/tls/wildcard.key" },
  nginx: {
    confPath: "/le/nginx/nginx.conf",
    pidPath: "/le/nginx/nginx.pid",
    errorLogPath: "/le/logs/nginx-error.log",
    accessLogPath: "/le/logs/nginx-access.log",
    tempDir: "/le/nginx/tmp",
  },
};

const proxyProtocolPorts = { streamPort: 8463, httpPort: 8464, relayPort: 8465 };

function manifestFor(hostnames: LocalEdgeCore_ExposureHostnamesConfig): LocalEdgeCore_ExposureManifest {
  return {
    protectedPorts: [443, 8445],
    hostnames,
    apps: [
      { id: "auth", edgeName: "auth-api", enabled: true, localPort: 4300 },
      {
        id: "web",
        edgeName: "web-app",
        enabled: true,
        localPort: 3210,
        locations: [{ path: "/api", localPort: 3211 }],
      },
      { id: "later", enabled: false, localPort: 3300 },
    ],
  };
}

const connectionConfig = baseSettings;
const proxyProtocolConfig: LocalEdgeCore_ExposureHostnamesConfig = {
  ...baseSettings,
  clientAddress: "proxy-protocol",
  proxyProtocol: proxyProtocolPorts,
};

const connectionText = LocalEdgeCore_renderExposureHostnamesNginxConfig(manifestFor(connectionConfig));
const proxyProtocolText = LocalEdgeCore_renderExposureHostnamesNginxConfig(manifestFor(proxyProtocolConfig));

const addressHeaderLines = [
  "      proxy_set_header X-Forwarded-For $local_edge_client_addr;",
  "      proxy_set_header X-Real-IP $local_edge_client_addr;",
  "      proxy_set_header X-Real-Port $local_edge_client_port;",
  '      proxy_set_header Forwarded "";',
  '      proxy_set_header X-Client-IP "";',
  '      proxy_set_header True-Client-IP "";',
].join("\n");

const clientMaps = [
  '  map $proxy_protocol_addr $local_edge_client_addr { "" $remote_addr; default $proxy_protocol_addr; }',
  '  map $proxy_protocol_port $local_edge_client_port { "" $remote_port; default $proxy_protocol_port; }',
];

function problemsFor(patch: Partial<LocalEdgeCore_ExposureHostnamesConfig>): string {
  return LocalEdgeCore_validateExposureHostnames(manifestFor({ ...proxyProtocolConfig, ...patch })).join("\n");
}

for (const [mode, text] of [
  ["connection", connectionText],
  ["proxy-protocol", proxyProtocolText],
] as const) {
  void test(`client address (${mode}): one value in X-Forwarded-For and X-Real-IP, never appended, spoofable headers cleared`, () => {
    assert.doesNotMatch(text, /proxy_add_x_forwarded_for/);
    assert.doesNotMatch(text, /\$http_x_forwarded_for|\$http_forwarded|\$http_x_real|\$http_x_client|\$http_true_client/);
    for (const line of clientMaps) {
      assert.ok(text.includes(`${line}\n`), line);
    }
    const locations = text.split("\n    location ").length - 1;
    assert.equal(locations, 3);
    assert.equal(text.split(`${addressHeaderLines}\n      proxy_set_header X-Forwarded-Proto https;`).length - 1, locations);
    assert.equal(text.split("proxy_set_header X-Forwarded-For").length - 1, locations);
    assert.equal(text.split("proxy_set_header X-Real-IP").length - 1, locations);
    assert.equal(text.split("proxy_set_header X-Real-Port").length - 1, locations);
  });

  void test(`client address (${mode}): the access log format has no address, no query string and no header values`, () => {
    const formats = text.match(/^ {2}log_format .*$/gm) ?? [];
    assert.deepEqual(formats, [
      "  log_format local_edge '$time_iso8601 $host $request_method $uri $server_protocol $status $body_bytes_sent $request_time';",
    ]);
    const format = formats[0] ?? "";
    for (const forbidden of [
      "$remote_addr",
      "$remote_port",
      "$binary_remote_addr",
      "$proxy_protocol",
      "$realip",
      "$http_",
      "$request ",
      "$request'",
      "$request_uri",
      "$args",
      "$query_string",
      "$upstream_addr",
    ]) {
      assert.ok(!format.includes(forbidden), forbidden);
    }
    assert.match(text, /^ {2}access_log \/le\/logs\/nginx-access\.log local_edge;$/m);
  });
}

void test("client address: connection is the default and clientAddress connection renders the same text", () => {
  const explicit = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifestFor({ ...connectionConfig, clientAddress: "connection" }),
  );
  assert.equal(explicit, connectionText);
  assert.doesNotMatch(connectionText, /proxy_protocol;|proxy_protocol on|set_real_ip_from|8463|8464|8465/);
  assert.match(connectionText, /^ {4}listen 127\.0\.0\.1:8462;$/m);
});

void test("client address (proxy-protocol): adds a stream listener, a relay and an http listener, existing listeners stay as they are", () => {
  const connectionStream = connectionText.slice(connectionText.indexOf("stream {"), connectionText.indexOf("http {"));
  const proxyStream = proxyProtocolText.slice(proxyProtocolText.indexOf("stream {"), proxyProtocolText.indexOf("http {"));
  const existingStream = connectionStream.replace(/}\n$/, "");
  assert.ok(proxyStream.startsWith(existingStream), "existing stream map and server are byte for byte as before");
  assert.equal(
    proxyStream.slice(existingStream.length),
    `  map $ssl_preread_server_name $local_edge_stream_proxy_protocol_upstream {
    ~\\.example\\.test$ 127.0.0.1:8464;
    default 127.0.0.1:8465;
  }
  server {
    listen 127.0.0.1:8463 proxy_protocol;
    set_real_ip_from 127.0.0.1;
    ssl_preread on;
    proxy_pass $local_edge_stream_proxy_protocol_upstream;
    proxy_protocol on;
    proxy_connect_timeout 5s;
  }
  server {
    listen 127.0.0.1:8465 proxy_protocol;
    proxy_pass 192.0.2.9:8452;
    proxy_connect_timeout 5s;
  }
}
`,
  );
  assert.equal(proxyProtocolText.split("proxy_protocol on;").length - 1, 1, "only the PROXY protocol stream server sends the header");

  assert.match(
    proxyProtocolText,
    /server \{ listen 127\.0\.0\.1:8460 ssl default_server; listen 127\.0\.0\.1:8461 ssl default_server; listen 127\.0\.0\.1:8464 ssl proxy_protocol default_server; server_name _; return 421; \}/,
  );
  const hostBlocks = proxyProtocolText.split("\n    server_name ").length - 1;
  assert.equal(hostBlocks, 2);
  assert.equal(
    proxyProtocolText.split(
      "    listen 127.0.0.1:8460 ssl;\n    listen 127.0.0.1:8461 ssl;\n    listen 127.0.0.1:8464 ssl proxy_protocol;\n    http2 on;",
    ).length - 1,
    hostBlocks,
  );
  // Every http listen line of the connection render is still there, in the same count.
  for (const listen of connectionText.match(/listen 127\.0\.0\.1:846[01] ssl[^;]*;/g) ?? []) {
    const count = (text: string) => text.split(listen).length - 1;
    assert.equal(count(proxyProtocolText), count(connectionText), listen);
  }
  // The new listener maps like the listener the stream routes point at (client port 443).
  assert.match(proxyProtocolText, /map \$server_port \$local_edge_forwarded_host \{\n {4}8460 \$host:8460;\n {4}8461 \$host;\n {4}8464 \$host;\n {2}\}/);
  assert.match(proxyProtocolText, /map \$server_port \$local_edge_forwarded_port \{\n {4}8460 8460;\n {4}8461 443;\n {4}8464 443;\n {2}\}/);
  // Nothing outside the added pieces differs in the head of the file, except the error_log level default.
  assert.equal(
    proxyProtocolText.slice(0, proxyProtocolText.indexOf("stream {")).replace(" crit;\n", " warn;\n"),
    connectionText.slice(0, connectionText.indexOf("stream {")),
  );
});

void test("client address (proxy-protocol): httpClientPort overrides the client port of the new listener", () => {
  const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(
    manifestFor({ ...proxyProtocolConfig, proxyProtocol: { ...proxyProtocolPorts, httpClientPort: 8470 } }),
  );
  assert.match(text, /8464 \$host:8470;/);
  assert.match(text, /8464 8470;/);
});

void test("client address: option validation names the problem and never repeats the value", () => {
  assert.equal(problemsFor({}), "");
  assert.equal(
    LocalEdgeCore_validateExposureHostnames(manifestFor({ ...connectionConfig, clientAddress: "connection" })).join("\n"),
    "",
  );
  const secret = "s3cr3t-value-pasted-by-mistake";
  const bad = problemsFor({ clientAddress: secret as "connection" });
  assert.match(bad, /hostnames\.clientAddress \(30 characters\) must be connection or proxy-protocol/);
  assert.ok(!bad.includes(secret));
  assert.match(problemsFor({ proxyProtocol: undefined }), /clientAddress proxy-protocol needs hostnames\.proxyProtocol ports/);
  assert.match(problemsFor({ stream: undefined }), /clientAddress proxy-protocol needs hostnames\.stream/);
  assert.match(
    LocalEdgeCore_validateExposureHostnames(
      manifestFor({ ...connectionConfig, proxyProtocol: proxyProtocolPorts }),
    ).join("\n"),
    /hostnames\.proxyProtocol is only used when clientAddress is proxy-protocol/,
  );
  const withPorts = (patch: Partial<LocalEdgeCore_ExposureProxyProtocolPorts>) => problemsFor({ proxyProtocol: { ...proxyProtocolPorts, ...patch } });
  assert.match(withPorts({ streamPort: 0 }), /proxyProtocol\.streamPort 0 is not a valid TCP port/);
  assert.match(withPorts({ httpPort: "8464" as unknown as number }), /proxyProtocol\.httpPort <not a number> is not a valid TCP port/);
  assert.match(withPorts({ relayPort: 70000 }), /proxyProtocol\.relayPort 70000 is not a valid TCP port/);
  assert.match(withPorts({ streamPort: 8445 }), /streamPort 8445 is protected/);
  assert.match(withPorts({ httpPort: 8460 }), /httpPort 8460 is already used as an HTTP listener/);
  assert.match(withPorts({ httpPort: 8461 }), /httpPort 8461 is already used as an HTTP listener/);
  assert.match(withPorts({ relayPort: 3211 }), /relayPort 3211 is already used as an app port/);
  assert.match(withPorts({ streamPort: 8462 }), /streamPort 8462 is already used as the stream router port/);
  assert.match(withPorts({ httpPort: 8463 }), /httpPort 8463 is already used as hostnames\.proxyProtocol\.streamPort/);
  assert.match(withPorts({ relayPort: 8463 }), /relayPort 8463 is already used as hostnames\.proxyProtocol\.streamPort/);
  assert.match(withPorts({ httpClientPort: 0 }), /httpClientPort 0 is not a valid TCP port/);
  const stray = problemsFor({
    stream: { ...baseSettings.stream!, routes: [{ serverName: "app.example.test", upstream: "192.0.2.7:8461" }] },
  });
  assert.match(stray, /hostnames\.stream route 1 must point at a router listener when clientAddress is proxy-protocol/);
  assert.throws(
    () => LocalEdgeCore_renderExposureHostnamesNginxConfig(manifestFor({ ...proxyProtocolConfig, proxyProtocol: undefined })),
    /local-edge-core-hostnames-invalid: .*needs hostnames\.proxyProtocol ports/,
  );
});

void test("error log level: default is warn in connection mode and crit in proxy-protocol mode, unless set", () => {
  const level = (text: string) => text.match(/^error_log \S+ (\w+);$/m)?.[1];
  assert.equal(level(connectionText), "warn");
  assert.equal(level(proxyProtocolText), "crit");
  const render = (patch: Partial<LocalEdgeCore_ExposureHostnamesConfig["nginx"]>, config = connectionConfig) =>
    LocalEdgeCore_renderExposureHostnamesNginxConfig(manifestFor({ ...config, nginx: { ...config.nginx, ...patch } }));
  assert.equal(level(render({}, { ...connectionConfig, clientAddress: "connection" })), "warn");
  assert.equal(level(render({ errorLogLevel: "error" })), "error");
  assert.equal(level(render({ errorLogLevel: "warn" }, proxyProtocolConfig)), "warn");
  assert.equal(level(render({ errorLogLevel: "debug" }, proxyProtocolConfig)), "debug");
  for (const each of ["debug", "info", "notice", "warn", "error", "crit", "alert", "emerg"]) {
    assert.equal(level(render({ errorLogLevel: each })), each);
  }
  assert.match(connectionText, /^error_log \/le\/logs\/nginx-error\.log warn;$/m);
});

void test("error log level: an invalid value is a named problem that never repeats the value", () => {
  const withLevel = (errorLogLevel: unknown) =>
    LocalEdgeCore_validateExposureHostnames(
      manifestFor({ ...connectionConfig, nginx: { ...baseSettings.nginx, errorLogLevel: errorLogLevel as string } }),
    ).join("\n");
  assert.equal(withLevel(undefined), "");
  assert.equal(withLevel("crit"), "");
  const secret = "s3cr3t-level-pasted-by-mistake; user root";
  const bad = withLevel(secret);
  assert.match(bad, /hostnames\.nginx\.errorLogLevel \(41 characters\) must be one of debug, info, notice, warn, error, crit, alert, emerg/);
  assert.ok(!bad.includes("s3cr3t"));
  assert.match(withLevel("Warn"), /errorLogLevel \(4 characters\) must be one of/);
  assert.match(withLevel(""), /errorLogLevel \(0 characters\) must be one of/);
  assert.match(withLevel(5), /errorLogLevel \(not a string\) must be one of/);
  assert.throws(
    () => LocalEdgeCore_renderExposureHostnamesNginxConfig(manifestFor({ ...connectionConfig, nginx: { ...baseSettings.nginx, errorLogLevel: secret } })),
    (error: unknown) => error instanceof Error && /local-edge-core-hostnames-invalid: .*errorLogLevel/.test(error.message) && !error.message.includes("s3cr3t"),
  );
});

// nginx -t on both renders, on temp files only, with a throwaway certificate. nginx -t only parses
// and opens files under the temp folder; it opens no listening socket and contacts no address.
// A test is skipped, with a reason, when the nginx on this machine cannot parse what the render
// needs (a build without the stream module, stream_ssl_preread or stream_realip), found by running
// nginx -t once on a minimal config for each. Any other nginx error is not a skip: the test fails.
function binaryPath(name: string): string | null {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : null;
}

/** What one `nginx -t` probe needs: the module name for the skip reason and the config it parses. */
const nginxProbes = [
  { module: "stream", body: "listen 127.0.0.1:9; proxy_pass 192.0.2.1:9;" },
  { module: "stream_ssl_preread", body: "listen 127.0.0.1:9; ssl_preread on; proxy_pass 192.0.2.1:9;" },
  { module: "stream_realip", body: "listen 127.0.0.1:9 proxy_protocol; set_real_ip_from 192.0.2.1; proxy_pass 192.0.2.1:9;" },
] as const;

/**
 * Runs `nginx -t` once per probe on a minimal stream config in a temp folder.
 *
 * @param bin - Path of the nginx binary.
 * @returns The modules this nginx cannot parse (a probe that failed with `unknown directive`); empty when it parses all.
 */
function unsupportedNginxModules(bin: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-core-probe-"));
  try {
    const missing: string[] = [];
    for (const probe of nginxProbes) {
      const confPath = path.join(dir, `${probe.module}.conf`);
      fs.writeFileSync(
        confPath,
        `pid ${dir}/nginx.pid;\nevents {}\nstream {\n  server { ${probe.body} }\n}\n`,
      );
      const checked = spawnSync(bin, ["-t", "-p", `${dir}/`, "-c", confPath, "-e", path.join(dir, "error.log")], { encoding: "utf8" });
      if (checked.status !== 0 && /unknown directive/.test(`${checked.stdout}${checked.stderr}`)) {
        missing.push(probe.module);
      }
    }
    return missing;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The reason a render cannot be checked with this nginx, or `false` when it can.
 *
 * @param bin - Path of the nginx binary, or `null` when none was found.
 * @param needs - Modules the render needs, in the names `nginxProbes` uses.
 * @returns A skip reason, or `false` to run the test.
 */
function nginxSkipReason(bin: string | null, needs: readonly string[]): string | false {
  const openssl = binaryPath("openssl");
  if (bin === null || openssl === null) {
    return "nginx or openssl binary not found";
  }
  const missing = unsupportedNginxModules(bin).filter((module) => needs.includes(module));
  return missing.length === 0 ? false : `this nginx cannot parse ${missing.join(", ")} (built without it)`;
}

void test("nginx probe: names the stream modules a fake nginx cannot parse, and does not skip on other errors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-core-fake-nginx-"));
  try {
    const fake = (name: string, failOn: string, message: string): string => {
      const bin = path.join(dir, name);
      fs.writeFileSync(
        bin,
        `#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "-c" ] && conf="$2"; shift; done\nif grep -q '${failOn}' "$conf"; then echo '${message}' >&2; exit 1; fi\nexit 0\n`,
        { mode: 0o755 },
      );
      return bin;
    };
    assert.deepEqual(unsupportedNginxModules(fake("all-ok", "no-such-text", "")), []);
    assert.deepEqual(
      unsupportedNginxModules(fake("no-stream", "stream {", 'nginx: [emerg] unknown directive "stream" in /x/nginx.conf:3')),
      ["stream", "stream_ssl_preread", "stream_realip"],
    );
    assert.deepEqual(
      unsupportedNginxModules(fake("no-preread", "ssl_preread", 'nginx: [emerg] unknown directive "ssl_preread" in /x/nginx.conf:3')),
      ["stream_ssl_preread"],
    );
    assert.deepEqual(
      unsupportedNginxModules(fake("no-realip", "set_real_ip_from", 'nginx: [emerg] unknown directive "set_real_ip_from" in /x/nginx.conf:3')),
      ["stream_realip"],
    );
    assert.deepEqual(
      unsupportedNginxModules(fake("other-error", "stream {", "nginx: [emerg] open() failed (13: Permission denied)")),
      [],
      "an error that is not an unknown directive is not a skip",
    );
    const reason = nginxSkipReason(fake("no-stream-2", "stream {", 'nginx: [emerg] unknown directive "stream"'), ["stream"]);
    assert.equal(reason, "this nginx cannot parse stream (built without it)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const nginxBin = binaryPath("nginx");
const opensslBin = binaryPath("openssl");

for (const [mode, hostnames, needs] of [
  ["connection", connectionConfig, ["stream", "stream_ssl_preread"]],
  ["proxy-protocol", proxyProtocolConfig, ["stream", "stream_ssl_preread", "stream_realip"]],
] as const) {
  void test(`nginx -t accepts the ${mode} render`, { skip: nginxSkipReason(nginxBin, needs) }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-edge-core-nginx-"));
    try {
      const certPath = path.join(dir, "wildcard.crt");
      const keyPath = path.join(dir, "wildcard.key");
      const made = spawnSync(
        opensslBin ?? "openssl",
        ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=example.test", "-keyout", keyPath, "-out", certPath],
        { encoding: "utf8" },
      );
      assert.equal(made.status, 0, "throwaway certificate");
      const confPath = path.join(dir, "nginx.conf");
      const text = LocalEdgeCore_renderExposureHostnamesNginxConfig(
        manifestFor({
          ...hostnames,
          tls: { mode: "provided", certPath, keyPath },
          nginx: {
            confPath,
            pidPath: path.join(dir, "nginx.pid"),
            errorLogPath: path.join(dir, "error.log"),
            accessLogPath: path.join(dir, "access.log"),
            tempDir: path.join(dir, "tmp"),
          },
        }),
      );
      fs.mkdirSync(path.join(dir, "tmp"));
      fs.writeFileSync(confPath, text);
      const checked = spawnSync(nginxBin ?? "nginx", ["-t", "-p", `${dir}/`, "-c", confPath, "-e", path.join(dir, "error.log")], {
        encoding: "utf8",
      });
      assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`);
      assert.match(`${checked.stdout}${checked.stderr}`, /syntax is ok/);
      assert.match(`${checked.stdout}${checked.stderr}`, /test is successful/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
