/**
 * @fileoverview Verifies `@gg-utils/local-edge-core` `package.json` `files` and `scripts` fields that govern
 * npm pack dry-run: `prepack` runs the build, published globs include `dist/` and `src/` while
 * excluding source unit tests from the packed tarball via the manifest negation entry asserted in this file.
 *
 * This file owns Node test regression coverage for the Level A publish contract in the package
 * manifest, asserting `prepack`, `pack:dry-run`, and the `files[]` negation pattern stay aligned with
 * CI and `npm pack` expectations.
 * Flow: resolve `package.json` beside this test -> narrow `files`/`scripts` -> assert script strings
 * and critical `files[]` entries including the unit-test exclusion glob.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/package-manifest.unit.test.ts
 *
 * @see packages/local-edge-core/package.json - Canonical manifest whose `prepack`, `pack:dry-run`, and `files[]` tarball rules are asserted here so publish dry-runs cannot drift silently.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for repository scanners and human review of module-boundary documentation.
 * @see packages/local-edge-core/tsconfig.build.json - TypeScript project build output paired with `prepack` so `dist/` membership in `files[]` remains a meaningful pack-time assertion.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Package manifest subset that controls the Level A dry-run tarball contract. */
type LocalEdgeCore_PackageManifestForTest = {
  files: string[];
  scripts: Record<string, string>;
};

/**
 * Narrows package.json object fields whose values are expected to be shell command strings.
 */
function LocalEdgeCore_isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * Narrows the package manifest fields this test needs without importing JSON through a loader.
 */
function LocalEdgeCore_isPackageManifestForTest(
  value: unknown,
): value is LocalEdgeCore_PackageManifestForTest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  if (!("files" in value) || !("scripts" in value)) {
    return false;
  }

  return (
    Array.isArray(value.files) &&
    value.files.every((entry) => typeof entry === "string") &&
    LocalEdgeCore_isStringRecord(value.scripts)
  );
}

/**
 * Reads the local package manifest so package distribution policy is covered by unit tests.
 */
function LocalEdgeCore_readPackageManifestForTest(): LocalEdgeCore_PackageManifestForTest {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const parsedPackageJson: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  assert.ok(
    LocalEdgeCore_isPackageManifestForTest(parsedPackageJson),
    "package.json must expose string files[] and scripts fields",
  );

  return parsedPackageJson;
}

test("package tarball dry-run builds first and excludes source unit tests", () => {
  const packageManifest = LocalEdgeCore_readPackageManifestForTest();

  assert.equal(packageManifest.scripts.prepack, "npm run build");
  assert.equal(packageManifest.scripts["pack:dry-run"], "npm pack --dry-run");
  assert.ok(packageManifest.files.includes("dist/"));
  assert.ok(packageManifest.files.includes("src/"));
  assert.ok(packageManifest.files.includes("!src/**/*.unit.test.ts"));
});
