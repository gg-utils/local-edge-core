/**
 * @fileoverview Verifies the `tailscale-serve-ports` backend guards and planners with a fake
 * command runner: no real `tailscale` call runs.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-tailscale-serve.unit.test.ts
 *
 * @see src/exposure-tailscale-serve.ts - Backend under test.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { LocalEdgeCore_ExposureManifest } from "./exposure.js";
import { LocalEdgeCore_validateExposureManifest } from "./exposure.js";
import {
  LocalEdgeCore_checkTailscaleServeArgv,
  LocalEdgeCore_createTailscaleServePortsBackend,
  LocalEdgeCore_parseTailnetSelfDnsName,
  LocalEdgeCore_parseTailscaleServeStatus,
} from "./exposure-tailscale-serve.js";

const HOST = "node-a.tailnet.example";

/** Serve status shaped like a real node: protected ports, a Funnel TCP port, a service. */
function serveStatus(extraWeb: Record<string, string> = {}): string {
  const web: Record<string, unknown> = {
    [`${HOST}:443`]: { Handlers: { "/": { Proxy: "http://127.0.0.1:3081" } } },
    [`${HOST}:8448`]: {
      Handlers: { "/": { Proxy: "http://127.0.0.1:3100" }, "/rest/v1": { Proxy: "http://127.0.0.1:8000/rest/v1" } },
    },
  };
  const tcp: Record<string, unknown> = {
    "443": { HTTPS: true },
    "8448": { HTTPS: true },
    "10000": { TCPForward: "127.0.0.1:8124", TerminateTLS: HOST },
  };
  for (const [port, target] of Object.entries(extraWeb)) {
    web[`${HOST}:${port}`] = { Handlers: { "/": { Proxy: target } } };
    tcp[port] = { HTTPS: true };
  }
  return JSON.stringify({
    TCP: tcp,
    Web: web,
    Services: { "svc:other": { TCP: { "443": { HTTPS: true } } } },
    AllowFunnel: { [`${HOST}:10000`]: true },
  });
}

type Call = { command: string; args: readonly string[] };

/** Fake runner that answers status calls and records every other call. */
function fakeRunner(initialStatusJson: string, options: { failApply?: boolean } = {}) {
  let statusJson = initialStatusJson;
  const setStatus = (next: string) => {
    statusJson = next;
  };
  const calls: Call[] = [];
  const runner = (command: string, args: readonly string[]) => {
    calls.push({ command, args });
    if (args[0] === "serve" && args[1] === "status") {
      return { status: 0, stdout: statusJson, stderr: "Warning: client version differs" };
    }
    if (args[0] === "status") {
      return { status: 0, stdout: JSON.stringify({ Self: { DNSName: `${HOST}.` } }), stderr: "" };
    }
    return { status: options.failApply ? 1 : 0, stdout: "", stderr: options.failApply ? "boom" : "" };
  };
  const mutations = () => calls.filter((c) => !(c.args[0] === "status" || c.args[1] === "status"));
  return { runner, calls, mutations, setStatus };
}

function manifest(overrides: Partial<LocalEdgeCore_ExposureManifest> = {}): LocalEdgeCore_ExposureManifest {
  return {
    protectedPorts: [443, 8443, 8444, 8445, 8446, 8447, 8448, 8449, 10000],
    apps: [
      { id: "auth", enabled: true, localPort: 4300, edgePort: 8451 },
      { id: "web", enabled: true, localPort: 3210, edgePort: 8450 },
      { id: "later", enabled: false, localPort: 3300, edgePort: 8452 },
    ],
    ...overrides,
  };
}

void test("parses serve status: web proxy, multi-handler, TCP forward, Funnel; ignores services", () => {
  const observed = LocalEdgeCore_parseTailscaleServeStatus(serveStatus({ "8450": "http://127.0.0.1:3210/" }));
  assert.deepEqual(observed.ports.get(8450), { port: 8450, kind: "web-proxy", proxyTarget: "http://127.0.0.1:3210", funnel: false });
  assert.equal(observed.ports.get(8448)?.kind, "web-other");
  assert.equal(observed.ports.get(10000)?.kind, "tcp");
  assert.equal(observed.ports.get(10000)?.funnel, true);
  assert.equal(observed.ports.size, 4);
  assert.equal(LocalEdgeCore_parseTailscaleServeStatus("").ports.size, 0);
});

void test("parses Self.DNSName without the trailing dot", () => {
  assert.equal(LocalEdgeCore_parseTailnetSelfDnsName(JSON.stringify({ Self: { DNSName: "a.b.tailnet.example." } })), "a.b.tailnet.example");
  assert.equal(LocalEdgeCore_parseTailnetSelfDnsName(JSON.stringify({})), null);
});

void test("plan exposes free ports, skips disabled apps, uses the node DNS name", () => {
  const { runner } = fakeRunner(serveStatus());
  const plan = LocalEdgeCore_createTailscaleServePortsBackend({ runner }).plan(manifest());
  assert.equal(plan.hostname, HOST);
  assert.equal(plan.applicable, true);
  assert.deepEqual(
    plan.actions.map((a) => [a.appId, a.kind]),
    [["auth", "expose"], ["web", "expose"], ["later", "skip"]],
  );
  assert.deepEqual(plan.actions[0]?.argv, ["tailscale", "serve", "--bg", "--https=8451", "http://127.0.0.1:4300"]);
  assert.equal(plan.actions[0]?.edgeUrl, `https://${HOST}:8451`);
});

void test("apply is a no-op when every port already matches", () => {
  const { runner, mutations } = fakeRunner(
    serveStatus({ "8450": "http://127.0.0.1:3210", "8451": "http://127.0.0.1:4300" }),
  );
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(manifest());
  assert.deepEqual(plan.actions.map((a) => a.kind), ["noop", "noop", "skip"]);
  const result = backend.apply(plan, { apply: true });
  assert.equal(result.ok, true);
  assert.match(result.message, /nothing to do/);
  assert.equal(mutations().length, 0);
});

void test("apply defaults to dry run and runs nothing", () => {
  const { runner, mutations } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const result = backend.apply(backend.plan(manifest()));
  assert.equal(result.dryRun, true);
  assert.equal(result.ok, true);
  assert.equal(mutations().length, 0);
});

void test("apply with --apply runs exactly the planned serve commands", () => {
  const { runner, mutations } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const result = backend.apply(backend.plan(manifest()), { apply: true });
  assert.equal(result.ok, true);
  assert.deepEqual(mutations().map((c) => c.args.join(" ")), [
    "serve --bg --https=8451 http://127.0.0.1:4300",
    "serve --bg --https=8450 http://127.0.0.1:3210",
  ]);
});

void test("apply stops at the first failing command", () => {
  const { runner, mutations } = fakeRunner(serveStatus(), { failApply: true });
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const result = backend.apply(backend.plan(manifest()), { apply: true });
  assert.equal(result.ok, false);
  assert.equal(mutations().length, 1);
});

void test("refuses a protected port and then applies nothing at all", () => {
  const { runner, mutations } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(
    manifest({
      apps: [
        { id: "auth", enabled: true, localPort: 4300, edgePort: 8451 },
        { id: "bad", enabled: true, localPort: 9999, edgePort: 8445 },
      ],
    }),
  );
  assert.equal(plan.applicable, false);
  assert.equal(plan.actions[1]?.kind, "refuse");
  assert.match(plan.actions[1]?.reason ?? "", /protected/);
  const result = backend.apply(plan, { apply: true });
  assert.equal(result.ok, false);
  assert.equal(mutations().length, 0);
});

void test("refuses a port mapped to a different target unless the app opts in", () => {
  const status = serveStatus({ "8450": "http://127.0.0.1:5555" });
  const { runner } = fakeRunner(status);
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  assert.equal(backend.plan(manifest()).actions[1]?.kind, "refuse");
  const optIn = manifest({
    apps: [{ id: "web", enabled: true, localPort: 3210, edgePort: 8450, replaceExistingMapping: true }],
  });
  assert.equal(backend.plan(optIn).actions[0]?.kind, "expose");
});

void test("never replaces multi-handler or TCP configs, even with opt-in", () => {
  const { runner } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(
    manifest({
      protectedPorts: [],
      apps: [
        { id: "a", enabled: true, localPort: 1, edgePort: 8448, replaceExistingMapping: true },
        { id: "b", enabled: true, localPort: 2, edgePort: 10000, replaceExistingMapping: true },
      ],
    }),
  );
  assert.deepEqual(plan.actions.map((a) => a.kind), ["refuse", "refuse"]);
  assert.match(plan.actions[1]?.reason ?? "", /Funnel/);
});

void test("remove turns off only ports whose single handler is this app's target", () => {
  const { runner, mutations } = fakeRunner(
    serveStatus({ "8450": "http://127.0.0.1:3210", "8451": "http://127.0.0.1:9999" }),
  );
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.planRemove(manifest());
  assert.deepEqual(plan.actions.map((a) => a.kind), ["refuse", "unexpose", "skip"]);
  assert.equal(backend.remove(manifest(), { apply: true }).ok, false);
  assert.equal(mutations().length, 0);
  const only = manifest({ apps: [{ id: "web", enabled: true, localPort: 3210, edgePort: 8450 }] });
  assert.equal(backend.remove(only, { apply: true }).ok, true);
  assert.deepEqual(mutations().map((c) => c.args.join(" ")), ["serve --https=8450 off"]);
});

void test("remove refuses a protected port even when it matches", () => {
  const { runner } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.planRemove(
    manifest({ apps: [{ id: "dsh", enabled: true, localPort: 3081, edgePort: 443 }] }),
  );
  assert.equal(plan.actions[0]?.kind, "refuse");
});

void test("argv guard rejects reset, Funnel, protected ports and unknown shapes", () => {
  const check = (argv: string[]) =>
    LocalEdgeCore_checkTailscaleServeArgv({ argv, tailscaleBin: "tailscale", protectedPorts: [443] });
  assert.equal(check(["tailscale", "serve", "--bg", "--https=8450", "http://127.0.0.1:3210"]), null);
  assert.equal(check(["tailscale", "serve", "--https=8450", "off"]), null);
  assert.notEqual(check(["tailscale", "serve", "reset"]), null);
  assert.notEqual(check(["tailscale", "funnel", "--bg", "8450"]), null);
  assert.notEqual(check(["tailscale", "serve", "--https=443", "off"]), null);
  assert.notEqual(check(["tailscale", "serve", "--bg", "--https=8450", "http://192.0.2.1:3210"]), null);
  assert.notEqual(check(["tailscale", "serve", "--bg", "--https=8450", "--set-path=/x", "http://127.0.0.1:1"]), null);
});

void test("apply refuses a plan that this backend instance did not build", () => {
  const { runner, mutations } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const forged = { ...backend.plan(manifest()) };
  assert.equal(backend.apply(forged, { apply: true }).ok, false);
  assert.equal(mutations().length, 0);
});

void test("serve status failure refuses every enabled app", () => {
  const runner = () => ({ status: 1, stdout: "", stderr: "not running" });
  const plan = LocalEdgeCore_createTailscaleServePortsBackend({ runner }).plan(manifest({ hostname: HOST }));
  assert.equal(plan.applicable, false);
  assert.match(plan.actions[0]?.reason ?? "", /not running/);
});

void test("status reports exposed, missing, protected, conflict and disabled", () => {
  const { runner } = fakeRunner(serveStatus({ "8450": "http://127.0.0.1:3210", "8452": "http://127.0.0.1:1" }));
  const rows = LocalEdgeCore_createTailscaleServePortsBackend({ runner }).status(
    manifest({
      apps: [
        { id: "web", enabled: true, localPort: 3210, edgePort: 8450 },
        { id: "auth", enabled: true, localPort: 4300, edgePort: 8451 },
        { id: "dsh", enabled: true, localPort: 3081, edgePort: 443 },
        { id: "other", enabled: true, localPort: 2, edgePort: 8452 },
        { id: "later", enabled: false, localPort: 3, edgePort: 8453 },
      ],
    }),
  );
  assert.deepEqual(rows.map((r) => r.state), ["exposed", "missing", "protected", "conflict", "disabled"]);
});

void test("manifest validation catches duplicates and bad ports", () => {
  const problems = LocalEdgeCore_validateExposureManifest({
    protectedPorts: [0],
    apps: [
      { id: "a", enabled: true, localPort: 1, edgePort: 8450 },
      { id: "a", enabled: true, localPort: 70000, edgePort: 8450 },
      { id: "Bad_Id", enabled: true, localPort: 2 },
    ],
  });
  assert.equal(problems.length, 5);
});

void test("an enabled app without an edge port is skipped, not refused, so the rest still applies", () => {
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({
    runner: () => ({ status: 0, stdout: "{}", stderr: "" }),
  });
  const plan = backend.plan({
    hostname: "node-a.tailnet.example",
    protectedPorts: [443],
    apps: [
      { id: "named-only", enabled: true, localPort: 3100 },
      { id: "web", enabled: true, localPort: 3000, edgePort: 8450 },
    ],
  });
  assert.deepEqual(plan.actions.map((a) => a.kind), ["skip", "expose"]);
  assert.equal(plan.applicable, true);
});

void test("apply re-reads status and refuses an expose plan whose port was taken after planning", () => {
  const { runner, mutations, setStatus } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(manifest());
  assert.equal(plan.actions[0]?.kind, "expose");
  setStatus(serveStatus({ "8451": "http://127.0.0.1:5555" }));
  const result = backend.apply(plan, { apply: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /changed since the plan was built/);
  assert.equal(mutations().length, 0);
});

void test("apply re-reads status and refuses a remove plan whose port was retargeted after planning", () => {
  const owned = manifest({ apps: [{ id: "web", enabled: true, localPort: 3210, edgePort: 8450 }] });
  const { runner, mutations, setStatus } = fakeRunner(serveStatus({ "8450": "http://127.0.0.1:3210" }));
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.planRemove(owned);
  assert.equal(plan.actions[0]?.kind, "unexpose");
  setStatus(serveStatus({ "8450": "http://127.0.0.1:5555" }));
  assert.equal(backend.apply(plan, { apply: true }).ok, false);
  setStatus(serveStatus());
  assert.equal(backend.apply(plan, { apply: true }).ok, false);
  assert.equal(mutations().length, 0);
  setStatus(serveStatus({ "8450": "http://127.0.0.1:3210" }));
  assert.equal(backend.apply(plan, { apply: true }).ok, true);
  assert.deepEqual(mutations().map((c) => c.args.join(" ")), ["serve --https=8450 off"]);
});

void test("apply refuses when the status re-read fails, and runs nothing", () => {
  let statusOk = true;
  const calls: string[] = [];
  const runner = (_command: string, args: readonly string[]) => {
    calls.push(args.join(" "));
    if (args[0] === "serve" && args[1] === "status") {
      return statusOk ? { status: 0, stdout: serveStatus(), stderr: "" } : { status: 1, stdout: "", stderr: "down" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(manifest({ hostname: HOST }));
  statusOk = false;
  const result = backend.apply(plan, { apply: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /down/);
  assert.deepEqual(calls.filter((c) => !c.includes("status")), []);
});

void test("apply executes only the validated copy: edited argv, kind, target or applicable are refused", () => {
  const edits: ((plan: { actions: Record<string, unknown>[]; applicable: boolean }) => void)[] = [
    (plan) => {
      const argv = plan.actions[0]?.argv as string[];
      argv[3] = "--https=8460";
    },
    (plan) => {
      (plan.actions[0] as Record<string, unknown>).argv = ["tailscale", "serve", "--bg", "--https=8460", "http://127.0.0.1:4300"];
    },
    (plan) => {
      (plan.actions[2] as Record<string, unknown>).kind = "expose";
      (plan.actions[2] as Record<string, unknown>).argv = ["tailscale", "serve", "--bg", "--https=8452", "http://127.0.0.1:3300"];
    },
    (plan) => {
      (plan.actions[0] as Record<string, unknown>).target = "http://127.0.0.1:9999";
    },
    (plan) => {
      plan.applicable = !plan.applicable;
    },
  ];
  for (const edit of edits) {
    const { runner, mutations } = fakeRunner(serveStatus());
    const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
    const plan = backend.plan(manifest());
    edit(plan as unknown as { actions: Record<string, unknown>[]; applicable: boolean });
    const result = backend.apply(plan, { apply: true });
    assert.equal(result.ok, false, `edited plan must be refused: ${result.message}`);
    assert.match(result.message, /changed after it was built/);
    assert.equal(mutations().length, 0);
  }
});

void test("a refusing plan flipped to applicable never runs its commands", () => {
  const { runner, mutations } = fakeRunner(serveStatus());
  const backend = LocalEdgeCore_createTailscaleServePortsBackend({ runner });
  const plan = backend.plan(
    manifest({ apps: [{ id: "web", enabled: true, localPort: 3210, edgePort: 8445 }] }),
  );
  assert.equal(plan.applicable, false);
  const edited = plan as unknown as { applicable: boolean; actions: Record<string, unknown>[] };
  edited.applicable = true;
  edited.actions[0] = { ...edited.actions[0], kind: "expose", argv: ["tailscale", "serve", "--bg", "--https=8460", "http://127.0.0.1:3210"] };
  assert.equal(backend.apply(plan, { apply: true }).ok, false);
  assert.equal(mutations().length, 0);
});
