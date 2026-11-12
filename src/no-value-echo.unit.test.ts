/**
 * @fileoverview Verifies that error and problem messages never repeat raw input.
 *
 * Every case feeds one check an oversized value that contains a unique marker and asserts the
 * marker appears in no message, no thrown error and no plan text. Each case also asserts that the
 * check did refuse the value, so a case cannot pass by testing nothing. Restoring any single echo
 * makes its case fail.
 * Flow: build the bait value for the case -> run the check -> collect every message it produced
 * -> assert the marker is absent and at least one message exists.
 *
 * @testing Node test runner (tsx): npm run test -- src/no-value-echo.unit.test.ts
 *
 * @see src/safe-message.ts - Helpers the fixed messages use.
 * @see src/exposure-hostnames.ts - Hostname backend whose problems are checked here.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LocalEdgeCore_parseRenderCliArgs } from "./cli.js";
import {
  LocalEdgeCore_parseOptionalBooleanFlag,
  LocalEdgeCore_parseRequiredPositiveInt,
} from "./config-primitives.js";
import { LocalEdgeCore_parseDnsAuditCliArgs } from "./dns.js";
import { LocalEdgeCore_doctorParseArgv } from "./doctor.js";
import type {
  LocalEdgeCore_ExposureHostnamesConfig,
  LocalEdgeCore_ExposureManifest,
  LocalEdgeCore_ExposurePlan,
} from "./exposure.js";
import { LocalEdgeCore_renderExposurePlanText, LocalEdgeCore_validateExposureManifest } from "./exposure.js";
import { LocalEdgeCore_createExposureBackend } from "./exposure-backends.js";
import {
  type LocalEdgeCore_PrivateDirProbe,
  LocalEdgeCore_nginxPathArgument,
  LocalEdgeCore_nginxPathProblem,
  LocalEdgeCore_nginxValueArgument,
  LocalEdgeCore_nginxValueProblem,
  LocalEdgeCore_planExposureHostnames,
  LocalEdgeCore_privateDirProblems,
  LocalEdgeCore_renderExposureHostnamesNginxConfig,
  LocalEdgeCore_validateExposureHostnames,
} from "./exposure-hostnames.js";
import { LocalEdgeCore_parseHealthcheckRuntimeOptions } from "./healthcheck.js";
import {
  LocalEdgeCore_buildCompactHostname,
  LocalEdgeCore_buildCompactLeftLabel,
  LocalEdgeCore_checkDnsLabel,
  LocalEdgeCore_checkHostnameLabels,
} from "./hostname.js";
import { LocalEdgeCore_parseLogsCli } from "./logs.js";
import {
  LocalEdgeCore_resolveConfiguredMethods,
  LocalEdgeCore_resolvePrimaryMethod,
  LocalEdgeCore_validateRequestedMethod,
} from "./method-config.js";
import type { LocalEdgeCore_Manifest } from "./manifest.js";
import { LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION, type LocalEdgeCore_RealmRecord } from "./registry.js";
import { LocalEdgeCore_buildManifestRoutePlan } from "./route-plan.js";
import {
  LocalEdgeCore_messageAppLabel,
  LocalEdgeCore_messageNumber,
  LocalEdgeCore_messageOption,
  LocalEdgeCore_messageValue,
  LocalEdgeCore_messageWord,
  LocalEdgeCore_messageWords,
} from "./safe-message.js";
import { LocalEdgeCore_parseShellShimArgv } from "./shell-shim.js";
import {
  LocalEdgeStartupCli_parseCommand,
  LocalEdgeStartupCli_parseStart,
} from "./startup-cli.js";
import { LocalEdgeCore_parseStatusCliArgs } from "./status.js";
import { LocalEdgeCore_parseUrlMatrixCliArgs } from "./url-matrix.js";
import { LocalEdgeCore_validatePort, LocalEdgeCore_validatePositiveInteger } from "./validation.js";
import { LocalEdgeCore_withLogsParseArgv } from "./with-logs.js";

/** Padding that makes every bait value far longer than any limit a check has. */
const PAD = "x".repeat(2000);

/** The bait for one case: the marker, then padding, then optional text that breaks a shape rule. */
function bait(marker: string, tail = ""): string {
  return `${marker}${PAD}${tail}`;
}

/** Narrows a deliberately wrong value to the type a check declares, so the check sees it as is. */
function wrong<T>(value: unknown): T {
  return value as T;
}

/** Messages from a check that is expected to throw. Fails the case when nothing is thrown. */
function thrown(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    return [error instanceof Error ? `${error.name}: ${error.message}` : String(error)];
  }
  assert.fail("the check accepted the bait value");
}

const privateDirs: LocalEdgeCore_PrivateDirProbe = () => ({ exists: true, mode: 0o700, gitRoot: null });

const baseSettings: LocalEdgeCore_ExposureHostnamesConfig = {
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
  addresses: { ipv4: "192.0.2.9" },
};

/** A valid manifest with `overrides` applied to the hostname settings and `apps` replaced when given. */
function manifestWith(
  settingsPatch: Record<string, unknown>,
  apps: readonly Record<string, unknown>[] = [{ id: "web", enabled: true, localPort: 3210 }],
): LocalEdgeCore_ExposureManifest {
  return wrong<LocalEdgeCore_ExposureManifest>({
    protectedPorts: [443, 8445],
    hostnames: { ...baseSettings, ...settingsPatch },
    apps,
  });
}

/** Problems from the hostnames validation for a patched manifest. */
function hostnameProblems(
  settingsPatch: Record<string, unknown>,
  apps?: readonly Record<string, unknown>[],
): string[] {
  const problems = LocalEdgeCore_validateExposureHostnames(manifestWith(settingsPatch, apps));
  assert.ok(problems.length > 0, "the validation reported no problem for the bait value");
  return problems;
}

/** Problems from the shared manifest validation. */
function manifestProblems(manifest: Record<string, unknown>): string[] {
  const problems = LocalEdgeCore_validateExposureManifest(wrong<LocalEdgeCore_ExposureManifest>(manifest));
  assert.ok(problems.length > 0, "the validation reported no problem for the bait value");
  return problems;
}

const renderArgs = { defaultMethod: "nginx-docker", supportedMethods: ["nginx-docker"], commandLabel: "t" };

type EchoCase = {
  /** What is checked; shown in the test name. */
  name: string;
  /** Unique marker inside the bait. Lower-case letters and digits unless the rule needs other characters. */
  marker: string;
  /** Runs the check with a bait made from the marker and returns every message it produced. */
  run: (marker: string) => string[];
};

const cases: readonly EchoCase[] = [
  // --- src/exposure.ts: manifest problems
  { name: "manifest hostname", marker: "mk01zz", run: (m) => manifestProblems({ protectedPorts: [], apps: [], hostname: bait(m) }) },
  { name: "manifest rootZone", marker: "mk02zz", run: (m) => manifestProblems({ protectedPorts: [], apps: [], rootZone: bait(m) }) },
  {
    name: "app edgeName",
    marker: "mk03zz",
    run: (m) => manifestProblems({ protectedPorts: [], apps: [{ id: "web", enabled: true, localPort: 1, edgeName: bait(m) }] }),
  },
  {
    name: "app id with a bad shape",
    marker: "mk04zz",
    run: (m) => manifestProblems({ protectedPorts: [], apps: [{ id: bait(m, "Q;"), enabled: true, localPort: 1 }] }),
  },
  {
    name: "app id that is well formed but longer than a DNS label",
    marker: "mk05zz",
    run: (m) =>
      manifestProblems({
        protectedPorts: [],
        apps: [{ id: bait(m), enabled: true, localPort: 99999 }],
      }),
  },
  {
    name: "app id listed twice",
    marker: "mk06zz",
    run: (m) =>
      manifestProblems({
        protectedPorts: [],
        apps: [
          { id: bait(m), enabled: true, localPort: 1 },
          { id: bait(m), enabled: true, localPort: 2 },
        ],
      }),
  },
  {
    name: "ports that are not numbers",
    marker: "mk07zz",
    run: (m) =>
      manifestProblems({
        protectedPorts: [bait(m)],
        apps: [{ id: "web", enabled: true, localPort: bait(m), edgePort: bait(m) }],
      }),
  },
  {
    name: "edge port shared by apps with long ids",
    marker: "mk08zz",
    run: (m) =>
      manifestProblems({
        protectedPorts: [],
        apps: [
          { id: bait(m), enabled: true, localPort: 1, edgePort: 9000 },
          { id: bait(m, "2"), enabled: true, localPort: 2, edgePort: 9000 },
        ],
      }),
  },
  {
    name: "plan text for an action whose app id is long",
    marker: "mk09zz",
    run: (m) => {
      const plan: LocalEdgeCore_ExposurePlan = {
        backend: "hostnames",
        hostname: null,
        applicable: false,
        actions: [{ appId: bait(m), kind: "refuse", requires: "none", reason: "manifest invalid" }],
      };
      return [LocalEdgeCore_renderExposurePlanText(plan)];
    },
  },

  // --- src/exposure-hostnames.ts: paths and values
  {
    name: "nginx path problem",
    marker: "mk10zz",
    run: (m) => {
      const problem = LocalEdgeCore_nginxPathProblem("hostnames.nginx.pidPath", `/${bait(m)};`);
      assert.notEqual(problem, null);
      return [String(problem)];
    },
  },
  {
    name: "nginx path argument error",
    marker: "mk11zz",
    run: (m) => thrown(() => LocalEdgeCore_nginxPathArgument("hostnames.nginx.pidPath", `/${bait(m)};`)),
  },
  { name: "path setting in the settings", marker: "mk12zz", run: (m) => hostnameProblems({ tls: { ...baseSettings.tls, certPath: `/${bait(m)};` } }) },
  {
    name: "nginx value problem for host, upstreamHost and readTimeout",
    marker: "mk13zz",
    run: (m) =>
      (["host", "upstreamHost", "readTimeout"] as const).map((kind) => {
        const problem = LocalEdgeCore_nginxValueProblem("field", kind, `${bait(m)};`);
        assert.notEqual(problem, null);
        return String(problem);
      }),
  },
  {
    name: "nginx value argument error",
    marker: "mk14zz",
    run: (m) => thrown(() => LocalEdgeCore_nginxValueArgument("field", "upstreamHost", bait(m))),
  },
  {
    name: "rendering the router config with an unsafe path",
    marker: "mk15zz",
    run: (m) =>
      thrown(() =>
        LocalEdgeCore_renderExposureHostnamesNginxConfig(
          manifestWith({ nginx: { ...baseSettings.nginx, pidPath: `/${bait(m)};` } }),
        ),
      ),
  },

  // --- src/exposure-hostnames.ts: settings
  { name: "rootZone without a dot", marker: "mk16zz", run: (m) => hostnameProblems({ rootZone: bait(m) }) },
  { name: "rootZone with bad labels", marker: "mk17zz", run: (m) => hostnameProblems({ rootZone: `${bait(m)}.${bait(m)}` }) },
  { name: "projectMachineLabel", marker: "mk18zz", run: (m) => hostnameProblems({ projectMachineLabel: bait(m) }) },
  { name: "realm with no usable characters", marker: "%^&*(", run: (m) => hostnameProblems({ realm: `${m.repeat(400)}` }) },
  { name: "acme dnsProvider", marker: "mk19zz", run: (m) => hostnameProblems({ acme: { ...wrong<object>({ client: "lego", dataDir: "/le/lego", keyType: "EC256" }), dnsProvider: bait(m) } }) },
  { name: "wildcard template", marker: "mk20zz", run: (m) => hostnameProblems({ wildcardTemplate: bait(m) }) },
  {
    name: "extra wildcard template",
    marker: "mk21zz",
    run: (m) => hostnameProblems({ extraWildcardTemplates: [bait(m)] }),
  },
  {
    name: "ports that are not numbers in the settings",
    marker: "mk22zz",
    run: (m) =>
      hostnameProblems({
        routerPort: bait(m),
        edgePort: bait(m),
        nginx: { ...baseSettings.nginx, workerConnections: bait(m) },
        listeners: [{ port: bait(m), clientPort: bait(m) }],
        stream: { port: bait(m), routes: [], defaultUpstream: "127.0.0.1:1" },
      }),
  },
  {
    name: "listener client port that is not a number",
    marker: "mk23zz",
    run: (m) => hostnameProblems({ listeners: [{ port: 8460, clientPort: bait(m) }] }),
  },

  // --- src/exposure-hostnames.ts: apps and locations
  {
    name: "app with a long id: port, proxy and location problems",
    marker: "mk24zz",
    run: (m) =>
      hostnameProblems({}, [
        {
          id: bait(m),
          enabled: true,
          localPort: 8460,
          proxy: { upstreamHost: bait(m), readTimeout: bait(m), buffering: bait(m) },
          locations: [{ path: "/files", localPort: 8000 }],
        },
      ]),
  },
  {
    name: "location path and upstreamPath",
    marker: "mk25zz",
    run: (m) =>
      hostnameProblems({}, [
        { id: "web", enabled: true, localPort: 3210, locations: [{ path: bait(m, ";"), upstreamPath: bait(m, ";"), localPort: 8000 }] },
      ]),
  },
  {
    name: "duplicate location path",
    marker: "mk26zz",
    run: (m) =>
      hostnameProblems({}, [
        {
          id: "web",
          enabled: true,
          localPort: 3210,
          locations: [
            { path: bait(m), localPort: 8000 },
            { path: bait(m), localPort: 8001 },
          ],
        },
      ]),
  },
  {
    name: "location port that is not a number, and location proxy options",
    marker: "mk27zz",
    run: (m) =>
      hostnameProblems({}, [
        {
          id: "web",
          enabled: true,
          localPort: 3210,
          locations: [{ path: "/files", localPort: bait(m), upstreamHost: bait(m), readTimeout: bait(m), buffering: bait(m) }],
        },
      ]),
  },
  { name: "exact host that is too long", marker: "mk28zz", run: (m) => hostnameProblems({}, [{ id: "web", enabled: true, localPort: 3210, host: bait(m) }]) },
  {
    name: "built host that is not under the wildcard",
    marker: "mk29zz",
    run: (m) => hostnameProblems({}, [{ id: "web", enabled: true, localPort: 3210, hostnameTemplate: bait(m) }]),
  },
  {
    name: "host function that returns a long name",
    marker: "mk30zz",
    run: (m) => hostnameProblems({ buildHostname: () => bait(m) }),
  },
  {
    name: "host function that throws",
    marker: "mk31zz",
    run: (m) =>
      hostnameProblems({
        buildHostname: () => {
          throw new Error(bait(m));
        },
      }),
  },
  {
    name: "two apps built to the same long host",
    marker: "mk32zz",
    run: (m) =>
      hostnameProblems({ buildHostname: () => bait(m) }, [
        { id: bait(m, "a"), enabled: true, localPort: 3210 },
        { id: bait(m, "b"), enabled: true, localPort: 3211 },
      ]),
  },
  {
    name: "app edgeName that cannot form a label",
    marker: "mk33zz",
    run: (m) => hostnameProblems({}, [{ id: "web", enabled: true, localPort: 3210, edgeName: bait(m) }]),
  },
  {
    name: "unusable wildcard makes the host messages stay generic",
    marker: "mk34zz",
    run: (m) => hostnameProblems({ rootZone: `${m}.${PAD}.test` }, [{ id: "web", enabled: true, localPort: 3210 }]),
  },

  // --- src/exposure-hostnames.ts: stream router
  {
    name: "stream route server names and upstreams",
    marker: "mk35zz",
    run: (m) =>
      hostnameProblems({
        listeners: [{ port: 8460 }, { port: 8461 }],
        stream: {
          port: 8452,
          routes: [
            { serverName: `${bait(m)};`, upstream: bait(m) },
            { serverName: `${bait(m)};`, upstream: bait(m) },
          ],
          defaultUpstream: bait(m),
          connectTimeout: bait(m),
        },
      }),
  },
  {
    name: "stream route that repeats a long server name",
    marker: "mk36zz",
    run: (m) =>
      hostnameProblems({
        listeners: [{ port: 8460 }, { port: 8461 }],
        stream: {
          port: 8452,
          routes: [
            { serverName: bait(m), upstream: "127.0.0.1:8461" },
            { serverName: bait(m), upstream: "127.0.0.1:8461" },
          ],
          defaultUpstream: "192.0.2.9:8452",
        },
      }),
  },
  {
    name: "private folder check for a long folder name",
    marker: "mk37zz",
    run: (m) =>
      LocalEdgeCore_privateDirProblems(`/${bait(m)};`, () => ({ exists: false, mode: null, gitRoot: `/${bait(m)}` })),
  },
  {
    name: "private folder check with a long folder name that has a bad mode and a git root",
    marker: "mk38zz",
    run: (m) => LocalEdgeCore_privateDirProblems(`/${bait(m)}`, () => ({ exists: true, mode: 0o755, gitRoot: `/${bait(m)}` })),
  },
  {
    name: "plan for an invalid hostnames manifest",
    marker: "mk39zz",
    run: (m) => {
      const actions = LocalEdgeCore_planExposureHostnames(
        manifestWith({ projectMachineLabel: bait(m) }, [{ id: bait(m, "Q"), enabled: true, localPort: 3210 }]),
        { inspectDir: privateDirs },
      );
      const reasons = actions.map((action) => `${action.appId.slice(0, 0)}${action.reason}`);
      assert.ok(reasons.some((reason) => reason.includes("manifest invalid")));
      return reasons;
    },
  },

  // --- src/exposure-backends.ts and src/exposure-tailscale-serve.ts
  {
    name: "unknown backend name",
    marker: "mk40zz",
    run: (m) => thrown(() => LocalEdgeCore_createExposureBackend(bait(m))),
  },
  {
    name: "apply of a plan built for another backend",
    marker: "mk41zz",
    run: (m) => {
      const backend = LocalEdgeCore_createExposureBackend("tailscale-serve-ports", {
        runner: () => ({ status: 0, stdout: "{}", stderr: "" }),
      });
      const plan = backend.plan({ protectedPorts: [], apps: [], hostname: "node-a.tailnet.example" });
      return [backend.apply({ ...plan, backend: bait(m) }, { apply: true }).message];
    },
  },
  {
    name: "tailscale-serve plan refusal for a manifest with a long app id",
    marker: "mk42zz",
    run: (m) => {
      const backend = LocalEdgeCore_createExposureBackend("tailscale-serve-ports", {
        runner: () => ({ status: 0, stdout: "{}", stderr: "" }),
      });
      const plan = backend.plan({
        protectedPorts: [],
        hostname: "node-a.tailnet.example",
        apps: [{ id: bait(m, "Q"), enabled: true, localPort: 3210 }],
      });
      const refusal = backend.apply(plan, { apply: true }).message;
      return [LocalEdgeCore_renderExposurePlanText(plan), refusal];
    },
  },

  // --- src/hostname.ts
  { name: "DNS label that is too long", marker: "mk43zz", run: (m) => [String(LocalEdgeCore_checkDnsLabel(bait(m)))] },
  { name: "DNS label with bad characters", marker: "mk44zz", run: (m) => [String(LocalEdgeCore_checkDnsLabel(`${m}_Q`))] },
  { name: "DNS label that starts with a dash", marker: "mk45zz", run: (m) => [String(LocalEdgeCore_checkDnsLabel(`-${m}`))] },
  { name: "DNS label with a dash pair", marker: "mk46zz", run: (m) => [String(LocalEdgeCore_checkDnsLabel(`ab--${m}`))] },
  { name: "dotted name with bad labels", marker: "mk47zz", run: (m) => LocalEdgeCore_checkHostnameLabels(`${bait(m)}.${bait(m)}`) },
  {
    name: "compact label for an invalid app",
    marker: "mk48zz",
    run: (m) =>
      thrown(() =>
        LocalEdgeCore_buildCompactLeftLabel({ app: bait(m), realm: "main", projectMachineLabel: "proj-node1", rootZone: "example.test" }),
      ),
  },
  {
    name: "compact hostname for an invalid machine label",
    marker: "mk49zz",
    run: (m) =>
      thrown(() =>
        LocalEdgeCore_buildCompactHostname({ app: "web", realm: "main", projectMachineLabel: bait(m), rootZone: "example.test" }),
      ),
  },

  // --- command-line and environment checks
  {
    name: "render CLI unknown option",
    marker: "mk50zz",
    run: (m) => thrown(() => LocalEdgeCore_parseRenderCliArgs({ ...renderArgs, args: [`--${bait(m)}`] })),
  },
  {
    name: "render CLI option that carries a value",
    marker: "mk51zz",
    run: (m) => thrown(() => LocalEdgeCore_parseRenderCliArgs({ ...renderArgs, args: [`--token=${m}`] })),
  },
  {
    name: "render CLI unsupported method",
    marker: "mk52zz",
    run: (m) => thrown(() => LocalEdgeCore_parseRenderCliArgs({ ...renderArgs, args: ["--method", bait(m)] })),
  },
  {
    name: "URL matrix CLI unknown option",
    marker: "mk53zz",
    run: (m) => thrown(() => LocalEdgeCore_parseUrlMatrixCliArgs({ ...renderArgs, args: [bait(m)] })),
  },
  {
    name: "status CLI unknown option",
    marker: "mk54zz",
    run: (m) => thrown(() => LocalEdgeCore_parseStatusCliArgs({ ...renderArgs, args: [bait(m)] })),
  },
  {
    name: "healthcheck CLI unknown option",
    marker: "mk55zz",
    run: (m) =>
      thrown(() =>
        LocalEdgeCore_parseHealthcheckRuntimeOptions({
          args: [bait(m)],
          defaultMethod: "nginx-docker",
          supportedMethods: ["nginx-docker"],
          strictStartValue: undefined,
          healthcheckLogVerbosityValue: undefined,
          commandLabel: "t",
          defaultIntervalMs: 1000,
          defaultSteadyIntervalMs: 5000,
          defaultTimeoutMs: 1000,
        }),
      ),
  },
  {
    name: "logs CLI unknown option",
    marker: "mk56zz",
    run: (m) => {
      const result = LocalEdgeCore_parseLogsCli({ argv: [bait(m)], defaultLines: "100", defaultCharsPerToken: "4" });
      assert.equal(result.ok, false);
      return [JSON.stringify(result)];
    },
  },
  {
    name: "DNS audit CLI unknown option and method",
    marker: "mk57zz",
    run: (m) =>
      [[bait(m)], ["--method", bait(m)]].map((args) => {
        const result = LocalEdgeCore_parseDnsAuditCliArgs({
          args,
          defaultMethod: "nginx-docker",
          defaultStrict: false,
          supportedMethods: ["nginx-docker"],
        });
        assert.equal(result.ok, false);
        return JSON.stringify(result);
      }),
  },
  { name: "doctor CLI unknown command", marker: "mk58zz", run: (m) => thrown(() => LocalEdgeCore_doctorParseArgv([bait(m)])) },
  {
    name: "shell shim unknown arguments and commands",
    marker: "mk59zz",
    run: (m) =>
      [
        [bait(m)],
        ["print-prelude", bait(m)],
        ["collect-active-env-files", bait(m)],
        ["normalize-legacy-artifact-path", bait(m)],
        ["print-method-url-matrix", bait(m)],
        ["resolve-log-color-enabled", bait(m)],
        ["resolve-log-color-enabled", "--is-tty-stdout", bait(m)],
        ["resolve-formatter-state", bait(m)],
        ["is-truthy", "true", bait(m)],
      ].flatMap((argv) => thrown(() => LocalEdgeCore_parseShellShimArgv(argv))),
  },
  {
    name: "with-logs CLI unknown command and bad exit code",
    marker: "mk60zz",
    run: (m) =>
      [
        ["node", "x", bait(m)],
        ["node", "x", "format-runtime-exit", "--exit-code", bait(m)],
      ].flatMap((argv) => thrown(() => LocalEdgeCore_withLogsParseArgv(argv))),
  },
  {
    name: "startup CLI unknown command, option and method",
    marker: "mk61zz",
    run: (m) =>
      [
        () => LocalEdgeStartupCli_parseCommand(bait(m), []),
        () => LocalEdgeStartupCli_parseCommand("doctor", [bait(m)]),
        () => LocalEdgeStartupCli_parseCommand("doctor", ["--method", bait(m)]),
        () => LocalEdgeStartupCli_parseStart(["--method", bait(m)]),
        () => LocalEdgeStartupCli_parseStart([bait(m)]),
      ].flatMap((run) => thrown(run)),
  },
  {
    name: "requested method",
    marker: "mk62zz",
    run: (m) =>
      thrown(() =>
        LocalEdgeCore_validateRequestedMethod({ allowAll: true, commandLabel: "t", method: bait(m), supportedMethods: ["nginx-docker"] }),
      ),
  },
  {
    name: "configured methods and primary method",
    marker: "mk63zz",
    run: (m) => {
      const configured = LocalEdgeCore_resolveConfiguredMethods({
        rawMethodsCsv: `nginx-docker,${bait(m)}`,
        supportedMethods: ["nginx-docker", bait(m)],
        defaultMethod: "nginx-docker",
        envName: "METHODS",
        unsupportedLegacyEnvKeys: [],
        singleMethodMode: true,
      });
      const primary = LocalEdgeCore_resolvePrimaryMethod({
        rawPrimaryMethod: bait(m),
        configuredMethodsResult: { ok: true, methodsCsv: bait(m) },
        supportedMethods: ["nginx-docker"],
        defaultMethod: "nginx-docker",
        primaryEnvName: "PRIMARY",
        methodsEnvName: "METHODS",
      });
      const listed = LocalEdgeCore_resolvePrimaryMethod({
        rawPrimaryMethod: "other",
        configuredMethodsResult: { ok: true, methodsCsv: bait(m) },
        supportedMethods: ["nginx-docker", "other"],
        defaultMethod: "nginx-docker",
        primaryEnvName: "PRIMARY",
        methodsEnvName: "METHODS",
      });
      assert.equal(configured.ok, false);
      assert.equal(primary.ok, false);
      assert.equal(listed.ok, false);
      return [JSON.stringify([configured, primary, listed])];
    },
  },
  {
    name: "environment values: integer and flag",
    marker: "mk64zz",
    run: (m) => [
      ...thrown(() => LocalEdgeCore_parseRequiredPositiveInt({ rawValue: bait(m), envName: "PORT" })),
      ...thrown(() => LocalEdgeCore_parseOptionalBooleanFlag({ rawValue: bait(m), envName: "FLAG", defaultValue: false })),
    ],
  },
  {
    name: "port and integer validation",
    marker: "mk65zz",
    run: (m) => {
      const results = [
        LocalEdgeCore_validatePort({ label: "PORT", value: bait(m) }),
        LocalEdgeCore_validatePort({ label: "PORT", value: `9${"9".repeat(2000)}` }),
        LocalEdgeCore_validatePositiveInteger({ label: "COUNT", value: bait(m) }),
      ];
      assert.ok(results.every((result) => !result.ok));
      return [JSON.stringify(results)];
    },
  },
  {
    name: "route plan with an unknown upstream, and one missing from the realm",
    marker: "mk66zz",
    run: (m) => {
      const manifest = {
        schemaVersion: 1,
        packageName: "demo",
        methods: ["nginx-docker"],
        upstreams: [{ id: "web", host: "127.0.0.1", port: 3000, protocol: "http" }],
        surfaces: [
          { id: bait(m), hostLabel: "www", upstreamId: bait(m, "u"), routeGroupId: "web", appPath: "/", statusPath: "/status", availability: { state: "local-edge-surface-availability-required" } },
        ],
      };
      const realmRecord = {
        schemaVersion: LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
        realmSlug: bait(m, "r"),
        status: "active",
        method: "nginx-docker",
        hostnameParts: { developerSlug: "developer", rootZone: "local.example.test" },
        workspace: { type: "external-consumer", path: "/tmp/toy" },
        upstreams: {},
        artifactPaths: { realmRoot: "/tmp/toy/.tmp/local-edge/realms/demo" },
        timestamps: { createdAt: "2026-05-19T00:00:00.000Z", registeredAt: "2026-05-19T00:01:00.000Z", lastSeenAt: "2026-05-19T00:02:00.000Z" },
      };
      const missingUpstream = thrown(() =>
        LocalEdgeCore_buildManifestRoutePlan({ manifest: wrong<LocalEdgeCore_Manifest>(manifest), realmRecord: wrong<LocalEdgeCore_RealmRecord>(realmRecord) }),
      );
      const missingInRealm = thrown(() =>
        LocalEdgeCore_buildManifestRoutePlan({
          manifest: wrong<LocalEdgeCore_Manifest>({ ...manifest, surfaces: [{ ...manifest.surfaces[0], upstreamId: "web" }] }),
          realmRecord: wrong<LocalEdgeCore_RealmRecord>(realmRecord),
        }),
      );
      return [...missingUpstream, ...missingInRealm];
    },
  },
];

for (const [index, entry] of cases.entries()) {
  void test(`no echo: ${String(index + 1).padStart(2, "0")} ${entry.name}`, () => {
    const messages = entry.run(entry.marker);
    assert.ok(messages.length > 0, "the check produced no message");
    assert.ok(
      messages.every((message) => message.length > 0),
      "the check produced an empty message",
    );
    for (const message of messages) {
      assert.ok(!message.includes(entry.marker), `a message repeats the input: ${message.slice(0, 160)}`);
      // A message may name the length, but it never grows with the input.
      assert.ok(message.length < 1500, `a message grows with the input (${String(message.length)} characters)`);
    }
  });
}

void test("no echo: the markers are unique", () => {
  assert.equal(new Set(cases.map((entry) => entry.marker)).size, cases.length);
});

void test("messages still name what is safe to name", () => {
  assert.equal(LocalEdgeCore_messageAppLabel("web", 3), "web");
  assert.equal(LocalEdgeCore_messageAppLabel("Web;", 3), "apps[3]");
  assert.equal(LocalEdgeCore_messageAppLabel("a".repeat(64), 3), "apps[3]");
  assert.equal(LocalEdgeCore_messageAppLabel("a".repeat(64)), "<app id, 64 characters>");
  assert.equal(LocalEdgeCore_messageNumber(70000), "70000");
  assert.equal(LocalEdgeCore_messageNumber("70000"), "<not a number>");
  assert.equal(LocalEdgeCore_messageOption("--method"), "--method");
  assert.equal(LocalEdgeCore_messageOption("--token=abc"), "<11 characters>");
  assert.equal(LocalEdgeCore_messageWord("render"), "render");
  assert.equal(LocalEdgeCore_messageWord("x".repeat(49)), "<49 characters>");
  assert.equal(LocalEdgeCore_messageValue("0"), "0");
  assert.equal(LocalEdgeCore_messageValue("p".repeat(25)), "<25 characters>");
  assert.equal(LocalEdgeCore_messageWords(["a", "b"]), "a b");
  assert.equal(LocalEdgeCore_messageWords(["a", "b", "c", "d", "e", "f", "g"]), "a b c d e (and 2 more)");
});

void test("a well formed app id and host are still named in problems", () => {
  const problems = LocalEdgeCore_validateExposureHostnames(
    manifestWith({}, [{ id: "stray", enabled: true, localPort: 3210, host: "stray.elsewhere.test" }]),
  );
  assert.ok(problems.some((problem) => problem.startsWith("stray: stray.elsewhere.test is not directly under *.proj-node1.example.test")));
});
