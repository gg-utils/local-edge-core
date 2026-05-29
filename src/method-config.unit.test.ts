/**
 * @fileoverview Verifies `LocalEdgeCore_*` method-config helpers for nginx-docker naming, generated
 * artifact paths, env-driven method lists, primary-method selection, and CLI `--method` validation.
 *
 * This file owns Node test regression coverage for `method-config.ts`, including slug normalization,
 * legacy env-key rejection, docker compose command strings, and split-DNS IP precedence.
 * Flow: build representative options objects -> invoke resolvers -> assert strings, numbers, deep
 * equality, or thrown message patterns.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/method-config.unit.test.ts
 *
 * @see packages/local-edge-core/src/method-config.ts - Pure resolver and validation helpers under test whose local-edge routing and compose naming contracts are asserted here.
 * @see packages/local-edge-core/src/cli.ts - Package CLI entrypoint that imports `LocalEdgeCore_validateRequestedMethod` and depends on the same method tokens and error messages exercised in this suite.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  LocalEdgeCore_isSupportedMethod,
  LocalEdgeCore_nginxDockerHostEnvName,
  LocalEdgeCore_nginxDockerPortEnvName,
  LocalEdgeCore_nginxDockerRequiredUtilities,
  LocalEdgeCore_resolveConfiguredMethods,
  LocalEdgeCore_resolveDeveloperSlug,
  LocalEdgeCore_resolveEnvSlug,
  LocalEdgeCore_resolveGeneratedDirBase,
  LocalEdgeCore_resolveNginxDockerComposePath,
  LocalEdgeCore_resolveNginxDockerConfigPath,
  LocalEdgeCore_resolveNginxDockerDefaultComposePath,
  LocalEdgeCore_resolveNginxDockerListenHost,
  LocalEdgeCore_resolveNginxDockerPort,
  LocalEdgeCore_resolveNginxDockerProjectName,
  LocalEdgeCore_resolveNginxDockerRequiredArtifactPaths,
  LocalEdgeCore_resolveNginxDockerSplitDnsIp,
  LocalEdgeCore_resolveNginxDockerStartCommand,
  LocalEdgeCore_resolveNginxDockerStopCommand,
  LocalEdgeCore_resolvePrimaryMethod,
  LocalEdgeCore_slugifySegment,
  LocalEdgeCore_validateRequestedMethod,
} from "./method-config.js";

const supportedMethods = ["nginx-docker"] as const;

test("LocalEdgeCore method config resolves generated dirs and slugs", () => {
  assert.equal(
    LocalEdgeCore_resolveGeneratedDirBase({
      projectRoot: "/tmp/example",
      configuredGeneratedDir: undefined,
    }),
    path.join("/tmp/example", ".tmp", "local-edge"),
  );
  assert.equal(
    LocalEdgeCore_resolveGeneratedDirBase({
      projectRoot: "/tmp/example",
      configuredGeneratedDir: path.join(
        "/tmp/example",
        ".tmp",
        "local-edge",
        "generated",
      ),
    }),
    path.join("/tmp/example", ".tmp", "local-edge"),
  );
  assert.equal(
    LocalEdgeCore_slugifySegment(" Example__/Name "),
    "example-name",
  );
  assert.equal(LocalEdgeCore_slugifySegment("!!!"), "default");
});

test("LocalEdgeCore method config resolves developer, env, and compose project names", () => {
  assert.equal(
    LocalEdgeCore_resolveDeveloperSlug({
      configuredDeveloperSlug: undefined,
      user: "Grace Hopper",
      defaultDeveloperSlug: "dev",
    }),
    "grace-hopper",
  );
  assert.equal(
    LocalEdgeCore_resolveDeveloperSlug({
      configuredDeveloperSlug: "",
      user: "ignored",
      defaultDeveloperSlug: "dev",
    }),
    "default",
  );
  assert.equal(
    LocalEdgeCore_resolveEnvSlug({
      configuredEnvSlug: undefined,
      defaultEnvSlug: "main",
    }),
    "main",
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerProjectName({
      configuredProjectName: undefined,
      configuredDeveloperSlug: undefined,
      user: "Grace Hopper",
      configuredEnvSlug: "Feature/A",
      projectNamePrefix: "local-edge-nginx-docker",
      defaultDeveloperSlug: "dev",
      defaultEnvSlug: "main",
    }),
    "local-edge-nginx-docker-grace-hopper-feature-a",
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerProjectName({
      configuredProjectName: " Custom Project ",
      configuredDeveloperSlug: undefined,
      user: "ignored",
      configuredEnvSlug: "ignored",
      projectNamePrefix: "local-edge-nginx-docker",
      defaultDeveloperSlug: "dev",
      defaultEnvSlug: "main",
    }),
    "custom-project",
  );
});

test("LocalEdgeCore method config resolves nginx-docker env names, utilities, and split-DNS IP", () => {
  assert.equal(
    LocalEdgeCore_nginxDockerPortEnvName(),
    "LOCAL_EDGE_NGINX_DOCKER_PORT",
  );
  assert.equal(
    LocalEdgeCore_nginxDockerHostEnvName(),
    "LOCAL_EDGE_NGINX_DOCKER_HOST",
  );
  assert.deepEqual(LocalEdgeCore_nginxDockerRequiredUtilities(), ["docker"]);
  assert.equal(
    LocalEdgeCore_resolveNginxDockerSplitDnsIp({
      rawSplitDnsIp: "127.0.0.3",
      rawListenHost: "127.0.0.2",
      defaultIp: "127.0.0.1",
    }),
    "127.0.0.3",
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerSplitDnsIp({
      rawSplitDnsIp: undefined,
      rawListenHost: "127.0.0.2",
      defaultIp: "127.0.0.1",
    }),
    "127.0.0.2",
  );
});

test("LocalEdgeCore method config resolves configured methods with legacy parity", () => {
  assert.equal(
    LocalEdgeCore_isSupportedMethod({
      method: "nginx-docker",
      supportedMethods,
    }),
    true,
  );
  assert.deepEqual(
    LocalEdgeCore_resolveConfiguredMethods({
      rawMethodsCsv: undefined,
      supportedMethods,
      defaultMethod: "nginx-docker",
      envName: "LOCAL_EDGE_METHODS",
      unsupportedLegacyEnvKeys: [],
      singleMethodMode: true,
    }),
    { ok: true, methodsCsv: "nginx-docker" },
  );
  assert.deepEqual(
    LocalEdgeCore_resolveConfiguredMethods({
      rawMethodsCsv: "unsupported, nginx-docker, nginx-docker",
      supportedMethods,
      defaultMethod: "nginx-docker",
      envName: "LOCAL_EDGE_METHODS",
      unsupportedLegacyEnvKeys: [],
      singleMethodMode: true,
    }),
    { ok: true, methodsCsv: "nginx-docker" },
  );
  assert.deepEqual(
    LocalEdgeCore_resolveConfiguredMethods({
      rawMethodsCsv: "nginx-docker",
      supportedMethods,
      defaultMethod: "nginx-docker",
      envName: "LOCAL_EDGE_METHODS",
      unsupportedLegacyEnvKeys: ["LOCAL_EDGE_MACOS_PROXY_PORT"],
      singleMethodMode: true,
    }),
    {
      ok: false,
      message:
        "Unsupported legacy host-managed local-edge env keys detected. Remove: LOCAL_EDGE_MACOS_PROXY_PORT.",
    },
  );
});

test("LocalEdgeCore method config resolves primary methods against configured methods", () => {
  const configuredMethods = LocalEdgeCore_resolveConfiguredMethods({
    rawMethodsCsv: "nginx-docker",
    supportedMethods,
    defaultMethod: "nginx-docker",
    envName: "LOCAL_EDGE_METHODS",
    unsupportedLegacyEnvKeys: [],
    singleMethodMode: true,
  });

  assert.deepEqual(
    LocalEdgeCore_resolvePrimaryMethod({
      rawPrimaryMethod: undefined,
      configuredMethodsResult: configuredMethods,
      supportedMethods,
      defaultMethod: "nginx-docker",
      primaryEnvName: "LOCAL_EDGE_PRIMARY_METHOD",
      methodsEnvName: "LOCAL_EDGE_METHODS",
    }),
    { ok: true, method: "nginx-docker" },
  );

  assert.deepEqual(
    LocalEdgeCore_resolvePrimaryMethod({
      rawPrimaryMethod: "",
      configuredMethodsResult: configuredMethods,
      supportedMethods,
      defaultMethod: "nginx-docker",
      primaryEnvName: "LOCAL_EDGE_PRIMARY_METHOD",
      methodsEnvName: "LOCAL_EDGE_METHODS",
    }),
    {
      ok: false,
      message: "LOCAL_EDGE_PRIMARY_METHOD is required and cannot be empty.",
    },
  );

  assert.deepEqual(
    LocalEdgeCore_resolvePrimaryMethod({
      rawPrimaryMethod: "unsupported",
      configuredMethodsResult: configuredMethods,
      supportedMethods,
      defaultMethod: "nginx-docker",
      primaryEnvName: "LOCAL_EDGE_PRIMARY_METHOD",
      methodsEnvName: "LOCAL_EDGE_METHODS",
    }),
    {
      ok: false,
      message:
        "LOCAL_EDGE_PRIMARY_METHOD='unsupported' is unsupported. Allowed value: nginx-docker.",
    },
  );
});

test("LocalEdgeCore method config resolves nginx-docker host and port overrides", () => {
  assert.equal(
    LocalEdgeCore_resolveNginxDockerPort({
      rawPort: undefined,
      defaultPort: 443,
    }),
    443,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerPort({
      rawPort: "4443",
      defaultPort: 443,
    }),
    4443,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerListenHost({
      rawHost: undefined,
      defaultHost: "127.0.0.1",
    }),
    "127.0.0.1",
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerListenHost({
      rawHost: "127.0.0.3",
      defaultHost: "127.0.0.1",
    }),
    "127.0.0.3",
  );
});

test("LocalEdgeCore method config resolves nginx-docker artifact paths", () => {
  const generatedDir = path.join("/tmp", "example", ".tmp", "local-edge");
  const composePath = path.join(
    generatedDir,
    "router",
    "nginx-docker",
    "docker-compose.yml",
  );
  const nginxConfigPath = path.join(
    generatedDir,
    "router",
    "nginx-docker",
    "nginx.conf",
  );

  assert.equal(
    LocalEdgeCore_resolveNginxDockerDefaultComposePath({ generatedDir }),
    composePath,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerComposePath({
      generatedDir,
      rawConfigPath: undefined,
    }),
    composePath,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerConfigPath({
      generatedDir,
      rawNginxConfigPath: undefined,
    }),
    nginxConfigPath,
  );
  assert.deepEqual(
    LocalEdgeCore_resolveNginxDockerRequiredArtifactPaths({
      generatedDir,
      rawConfigPath: undefined,
      rawNginxConfigPath: undefined,
    }),
    [composePath, nginxConfigPath],
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerComposePath({
      generatedDir,
      rawConfigPath: path.join(
        generatedDir,
        "generated",
        "nginx-docker",
        "main",
        "docker-compose.yml",
      ),
    }),
    composePath,
  );
});

test("LocalEdgeCore method config resolves nginx-docker start and stop commands", () => {
  const projectName = "local-edge-nginx-docker-dev-main";
  const composePath = path.join(
    "/tmp",
    "example",
    ".tmp",
    "local-edge",
    "router",
    "nginx-docker",
    "docker-compose.yml",
  );

  assert.equal(
    LocalEdgeCore_resolveNginxDockerStartCommand({
      rawStartCommand: undefined,
      projectName,
      composePath,
    }),
    `docker compose -p "${projectName}" -f "${composePath}" up -d`,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerStopCommand({
      rawStopCommand: undefined,
      projectName,
      composePath,
    }),
    `docker compose -p "${projectName}" -f "${composePath}" down`,
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerStartCommand({
      rawStartCommand: "docker compose up custom",
      projectName,
      composePath,
    }),
    "docker compose up custom",
  );
  assert.equal(
    LocalEdgeCore_resolveNginxDockerStopCommand({
      rawStopCommand: "docker compose down custom",
      projectName,
      composePath,
    }),
    "docker compose down custom",
  );
});

test("LocalEdgeCore method config validates requested method tokens", () => {
  assert.equal(
    LocalEdgeCore_validateRequestedMethod({
      allowAll: true,
      commandLabel: "local-edge:test",
      method: "all",
      supportedMethods,
    }),
    "all",
  );
  assert.equal(
    LocalEdgeCore_validateRequestedMethod({
      allowAll: false,
      commandLabel: "local-edge:test",
      method: "nginx-docker",
      supportedMethods,
    }),
    "nginx-docker",
  );
  assert.throws(
    () =>
      LocalEdgeCore_validateRequestedMethod({
        allowAll: false,
        commandLabel: "local-edge:test",
        method: "",
        supportedMethods,
      }),
    /\[local-edge:test\] --method requires a value\./,
  );
  assert.throws(
    () =>
      LocalEdgeCore_validateRequestedMethod({
        allowAll: false,
        commandLabel: "local-edge:test",
        method: "all",
        supportedMethods,
      }),
    /\[local-edge:test\] Unsupported --method 'all'\./,
  );
});
