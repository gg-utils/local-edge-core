/**
 * @fileoverview Verifies product-neutral local-edge config parsing primitives for slugs, numeric
 * ports, optional booleans, hosts, trimmed strings, and unique-port collision detection.
 *
 * This file owns Node test regression coverage for the helpers exported from `config-primitives.ts`,
 * focusing on normalization rules, validation errors, and defaults supplied by callers.
 * Flow: construct representative raw inputs -> invoke `LocalEdgeCore_*` helpers -> assert outputs
 * or expected thrown message patterns.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/config-primitives.unit.test.ts
 *
 * @see packages/local-edge-core/src/config-primitives.ts - Runtime parsing and normalization helpers under test whose error messages and edge-case behavior are asserted here.
 * @see scripts/local-edge/config.ts - Root local-edge adapter config that composes these primitives when translating env text into typed settings, so regressions here can surface as miswired local-edge hosts or ports.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEdgeCore_assertUniquePorts,
  LocalEdgeCore_normalizeSlug,
  LocalEdgeCore_normalizeSlugOrFallback,
  LocalEdgeCore_parseOptionalBooleanFlag,
  LocalEdgeCore_parseOptionalTrimmedValue,
  LocalEdgeCore_parseRequiredHostOrIp,
  LocalEdgeCore_parseRequiredPositiveInt,
} from "./config-primitives.js";

test("LocalEdgeCore_normalizeSlug builds DNS-safe slugs", () => {
  assert.equal(LocalEdgeCore_normalizeSlug(" Feature/Main_01 "), "feature-main-01");
});

test("LocalEdgeCore_normalizeSlugOrFallback uses fallback when primary is empty", () => {
  assert.equal(
    LocalEdgeCore_normalizeSlugOrFallback({ value: "---", fallback: "Dev User" }),
    "dev-user",
  );
});

test("LocalEdgeCore_parseRequiredPositiveInt rejects non-positive values", () => {
  assert.equal(
    LocalEdgeCore_parseRequiredPositiveInt({ rawValue: "4011", envName: "PORT" }),
    4011,
  );
  assert.throws(
    () => LocalEdgeCore_parseRequiredPositiveInt({ rawValue: "0", envName: "PORT" }),
    /PORT must be a positive integer/,
  );
});

test("LocalEdgeCore_parseOptionalBooleanFlag parses explicit boolean tokens", () => {
  assert.equal(
    LocalEdgeCore_parseOptionalBooleanFlag({
      rawValue: undefined,
      envName: "FLAG",
      defaultValue: true,
    }),
    true,
  );
  assert.equal(
    LocalEdgeCore_parseOptionalBooleanFlag({
      rawValue: "off",
      envName: "FLAG",
      defaultValue: true,
    }),
    false,
  );
});

test("LocalEdgeCore_parseRequiredHostOrIp trims non-empty host values", () => {
  assert.equal(
    LocalEdgeCore_parseRequiredHostOrIp({ rawValue: " 127.0.0.1 ", envName: "HOST" }),
    "127.0.0.1",
  );
  assert.throws(
    () => LocalEdgeCore_parseRequiredHostOrIp({ rawValue: " ", envName: "HOST" }),
    /HOST must be a non-empty host\/IP value/,
  );
});

test("LocalEdgeCore_parseOptionalTrimmedValue returns null for blank values", () => {
  assert.equal(LocalEdgeCore_parseOptionalTrimmedValue("  value  "), "value");
  assert.equal(LocalEdgeCore_parseOptionalTrimmedValue("   "), null);
  assert.equal(LocalEdgeCore_parseOptionalTrimmedValue(undefined), null);
});

test("LocalEdgeCore_assertUniquePorts rejects duplicate ports", () => {
  assert.throws(
    () =>
      LocalEdgeCore_assertUniquePorts([
        { name: "A", port: 4011 },
        { name: "B", port: 4011 },
      ]),
    /Port collision: B and A both resolved to 4011/,
  );
});
