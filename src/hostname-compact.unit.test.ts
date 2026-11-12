/**
 * @fileoverview Verifies the compact hostname helpers in `hostname.ts`: DNS label checks, realm
 * slug sanitizing with a hash when cut, the compact left label and hostname, and the template.
 *
 * @testing Node test runner (tsx): npm run test -- src/hostname-compact.unit.test.ts
 *
 * @see src/hostname.ts - Helpers under test.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_buildCompactHostname,
  LocalEdgeCore_buildCompactLeftLabel,
  LocalEdgeCore_checkDnsLabel,
  LocalEdgeCore_checkHostnameLabels,
  LocalEdgeCore_renderHostnameTemplate,
  LocalEdgeCore_sanitizeRealmSlug,
} from "./hostname.js";

const base = { app: "web-app", realm: "main", projectMachineLabel: "proj-node1", rootZone: "example.test" };

void test("DNS label check enforces charset, length, edges and the IDN slot", () => {
  assert.equal(LocalEdgeCore_checkDnsLabel("auth-api"), null);
  assert.equal(LocalEdgeCore_checkDnsLabel("web--feat"), null);
  assert.match(LocalEdgeCore_checkDnsLabel("") ?? "", /empty/);
  assert.match(LocalEdgeCore_checkDnsLabel("a".repeat(64)) ?? "", /longer than 63/);
  assert.match(LocalEdgeCore_checkDnsLabel("Web") ?? "", /lowercase/);
  assert.match(LocalEdgeCore_checkDnsLabel("-web") ?? "", /start or end/);
  assert.match(LocalEdgeCore_checkDnsLabel("xn--web") ?? "", /positions 3-4/);
  assert.deepEqual(LocalEdgeCore_checkHostnameLabels("*.proj-node1.example.test"), []);
  assert.equal(LocalEdgeCore_checkHostnameLabels("a.*.app").length, 1);
});

void test("realm slugs are sanitized and cut with a hash when too long", () => {
  assert.equal(LocalEdgeCore_sanitizeRealmSlug("Feat/Login__Page"), "feat-login-page");
  const long = "feature/".concat("x".repeat(80));
  const cut = LocalEdgeCore_sanitizeRealmSlug(long, { maxLength: 20 });
  assert.equal(cut.length, 20);
  assert.match(cut, /^feature-x+-[0-9a-f]{6}$/);
  assert.notEqual(cut, LocalEdgeCore_sanitizeRealmSlug(`${long}y`, { maxLength: 20 }));
});

void test("compact names: plain app for main, app--realm otherwise, always within 63", () => {
  assert.equal(LocalEdgeCore_buildCompactHostname(base), "web-app.proj-node1.example.test");
  assert.equal(
    LocalEdgeCore_buildCompactHostname({ ...base, realm: "pr-78" }),
    "web-app--pr-78.proj-node1.example.test",
  );
  const long = LocalEdgeCore_buildCompactLeftLabel({ ...base, realm: "b".repeat(90) });
  assert.equal(long.length, 63);
  assert.match(long, /^web-app--b+-[0-9a-f]{6}$/);
  assert.throws(() => LocalEdgeCore_buildCompactLeftLabel({ ...base, app: "a--b" }), /may not contain --/);
  assert.throws(() => LocalEdgeCore_buildCompactLeftLabel({ ...base, app: "Bad" }), /invalid-app/);
  assert.throws(() => LocalEdgeCore_buildCompactHostname({ ...base, projectMachineLabel: "Proj" }), /invalid/);
});

void test("templates fill app, realm, label, projectMachine and rootZone", () => {
  assert.equal(
    LocalEdgeCore_renderHostnameTemplate("{label}.{projectMachine}.{rootZone}", { ...base, realm: "Feat X" }),
    "web-app--feat-x.proj-node1.example.test",
  );
  assert.equal(LocalEdgeCore_renderHostnameTemplate("{app}-{realm}.{nope}", base), "web-app-main.{nope}");
});

void test("hostname check enforces the 253-character total, including wildcards", () => {
  const name = (length: number) => `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 63 * 3 - 3)}`;
  assert.deepEqual(LocalEdgeCore_checkHostnameLabels(name(253)), []);
  assert.match(LocalEdgeCore_checkHostnameLabels(name(254)).join("\n"), /254 characters, longer than 253/);
  assert.deepEqual(LocalEdgeCore_checkHostnameLabels(`*.${name(251)}`), []);
  assert.equal(LocalEdgeCore_checkHostnameLabels(`*.${name(252)}`).length, 1);
  assert.throws(
    () => LocalEdgeCore_buildCompactHostname({ ...base, rootZone: name(254 - "web-app.proj-node1.".length) }),
    /longer than 253/,
  );
});

void test("compact labels for one-, two- and three-character apps across realms", () => {
  for (const app of ["a", "ab", "abc"]) {
    assert.equal(LocalEdgeCore_buildCompactLeftLabel({ ...base, app }), app);
  }
  assert.equal(LocalEdgeCore_buildCompactLeftLabel({ ...base, app: "a", realm: "pr-7" }), "a--pr-7");
  assert.equal(LocalEdgeCore_buildCompactLeftLabel({ ...base, app: "abc", realm: "pr-7" }), "abc--pr-7");
  assert.throws(
    () => LocalEdgeCore_buildCompactLeftLabel({ ...base, app: "ab", realm: "pr-7" }),
    /local-edge-core-hostname-short-app: .*positions 3-4.*edgeName/,
  );
  assert.equal(LocalEdgeCore_buildCompactHostname({ ...base, app: "abc", realm: "pr-7" }), "abc--pr-7.proj-node1.example.test");
});
