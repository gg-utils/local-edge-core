/**
 * @fileoverview Verifies pure `LocalEdgeCore_*` nginx string renderers for variable `proxy_pass`
 * targets, TLS server blocks with optional websocket-safe proxy settings, full `http` wrapper
 * output including Docker resolver and upgrade maps, and Docker Compose service YAML for the
 * nginx-docker edge adapter.
 *
 * This file owns Node test regression coverage for the `LocalEdgeCore_renderNginxProxyPassDirective`,
 * `LocalEdgeCore_renderNginxServerBlock`, `LocalEdgeCore_renderNginxHttpConfig`, and
 * `LocalEdgeCore_renderNginxDockerCompose` exports from `nginx.js`, asserting stable templates,
 * header lines, health-check stubs, and compose indentation used when materializing router
 * artifacts.
 * Flow: build representative renderer options -> invoke helpers -> assert rendered strings with
 * `assert.match` or full-string equality for compose output.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/nginx.unit.test.ts
 *
 * @see packages/local-edge-core/src/nginx.ts - Product-neutral nginx render helpers under test whose generated `nginx.conf` and Compose fragments are asserted here.
 * @see packages/local-edge-core/src/router/nginx-docker.ts - Router barrel that re-exports these renderers so local-edge adapters can wire HTTPS edge materialization without reaching into test-only paths.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository verification tooling and reviews.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_renderNginxDockerCompose,
  LocalEdgeCore_renderNginxHttpConfig,
  LocalEdgeCore_renderNginxProxyPassDirective,
  LocalEdgeCore_renderNginxServerBlock,
} from "./nginx.js";

test("LocalEdgeCore_renderNginxProxyPassDirective renders variable proxy target", () => {
  assert.equal(
    LocalEdgeCore_renderNginxProxyPassDirective({
      upstreamHost: "host.docker.internal",
      upstreamPort: 3000,
      variableName: "local_edge_demo_web_upstream",
    }),
    `set $local_edge_demo_web_upstream host.docker.internal:3000;
      proxy_pass http://$local_edge_demo_web_upstream;`,
  );
});

test("LocalEdgeCore_renderNginxServerBlock renders websocket-safe proxy block", () => {
  const block = LocalEdgeCore_renderNginxServerBlock({
    method: "nginx-docker",
    listenHost: "0.0.0.0",
    listenPort: 443,
    serverNames: ["www.demo.local.example.test"],
    tls: {
      certPath: "/etc/nginx/certs/local-edge-cert.pem",
      keyPath: "/etc/nginx/certs/local-edge-key.pem",
    },
    surfaceHeader: "web",
    upstreamHost: "host.docker.internal",
    upstreamPort: 3000,
    variableName: "local_edge_demo_web_upstream",
    websocketSafe: true,
    routerHealthPath: "/__local-edge/router-health",
    routerHealthBody: "local-edge-router-ok\\n",
  });

  assert.match(block, /server_name www\.demo\.local\.example\.test;/);
  assert.match(block, /X-Local-Edge-Method nginx-docker;/);
  assert.match(block, /X-Local-Edge-Surface web;/);
  assert.match(block, /proxy_http_version 1\.1;/);
  assert.match(block, /return 204 "local-edge-router-ok\\n";/);
});

test("LocalEdgeCore_renderNginxServerBlock omits websocket directives for plain proxy", () => {
  const block = LocalEdgeCore_renderNginxServerBlock({
    method: "nginx-docker",
    listenHost: "0.0.0.0",
    listenPort: 443,
    serverNames: ["api.demo.local.example.test"],
    tls: {
      certPath: "/etc/nginx/certs/local-edge-cert.pem",
      keyPath: "/etc/nginx/certs/local-edge-key.pem",
    },
    surfaceHeader: "api",
    upstreamHost: "host.docker.internal",
    upstreamPort: 4000,
    variableName: "local_edge_demo_api_upstream",
    websocketSafe: false,
    routerHealthPath: "/__local-edge/router-health",
    routerHealthBody: "local-edge-router-ok\\n",
  });

  assert.equal(block.includes("proxy_http_version 1.1;"), false);
  assert.match(
    block,
    /set \$local_edge_demo_api_upstream host\.docker\.internal:4000;/,
  );
});

test("LocalEdgeCore_renderNginxHttpConfig wraps adapter server blocks", () => {
  const config = LocalEdgeCore_renderNginxHttpConfig({
    generatedBy: "demo-renderer.ts",
    mimeTypesPath: "/etc/nginx/mime.types",
    workerProcesses: 1,
    workerConnections: 1024,
    keepaliveTimeoutSeconds: 65,
    serverNamesHashBucketSize: 128,
    variablesHashBucketSize: 128,
    variablesHashMaxSize: 2048,
    clientBodyTimeoutSeconds: 600,
    clientMaxBodySize: "25m",
    proxyConnectTimeoutSeconds: 30,
    proxyReadTimeoutSeconds: 600,
    proxySendTimeoutSeconds: 600,
    sendTimeoutSeconds: 600,
    timeoutCommentLines: ["adapter supplied timeout rationale"],
    dockerResolver: {
      resolverAddress: "127.0.0.11",
      ipv6Mode: "off",
      validSeconds: 30,
      timeoutSeconds: 5,
    },
    serverBlocks: ["  server {\n    server_name www.demo.test;\n  }"],
  });

  assert.match(config, /# Generated by demo-renderer\.ts/);
  assert.match(config, /# adapter supplied timeout rationale/);
  assert.match(config, /resolver 127\.0\.0\.11 ipv6=off valid=30s;/);
  assert.match(config, /map \$http_upgrade \$local_edge_connection_upgrade/);
  assert.match(config, /server_name www\.demo\.test;/);
});

test("LocalEdgeCore_renderNginxDockerCompose renders generic service wiring", () => {
  const compose = LocalEdgeCore_renderNginxDockerCompose({
    projectName: "local-edge-demo",
    serviceName: "local-edge-nginx-docker",
    image: "nginx:1.27-alpine",
    restartPolicy: "unless-stopped",
    portBindings: [{ host: "127.0.0.1", hostPort: 443, containerPort: 443 }],
    labels: ["local-edge=true", "local-edge.method=nginx-docker"],
    volumeMounts: [
      {
        sourcePath: "/tmp/nginx.conf",
        targetPath: "/etc/nginx/nginx.conf",
        readOnly: true,
      },
    ],
  });

  assert.equal(
    compose,
    `name: local-edge-demo
services:
  local-edge-nginx-docker:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:443:443"
    labels:
      - "local-edge=true"
      - "local-edge.method=nginx-docker"
    volumes:
      - "/tmp/nginx.conf:/etc/nginx/nginx.conf:ro"
`,
  );
});
