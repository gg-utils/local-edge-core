/**
 * @fileoverview Pure hostname builders for agnostic local-edge realm/surface tuples.
 *
 * This module owns only deterministic string construction from caller-provided surface and realm
 * identity parts. Product-specific surface catalogs, URL paths, port matrices, and env keys belong
 * to an adapter outside `packages/local-edge-core`.
 * Flow: non-empty label validation -> join `surface.realmSlug.method.developerSlug.rootZone`; matrix helper maps each caller surface through the same join.
 *
 * @example
 * ```typescript
 * import { LocalEdgeCore_buildHostnameFromParts } from "@gg-utils/local-edge-core/hostnames";
 *
 * LocalEdgeCore_buildHostnameFromParts({
 *   surface: "www",
 *   realmSlug: "main",
 *   method: "nginx-docker",
 *   developerSlug: "dev-machine",
 *   rootZone: "example.test",
 * });
 * ```
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/hostname.unit.test.ts
 *
 * @see packages/local-edge-core/src/url-matrix.ts - URL matrix builder that composes per-surface URLs using dotted hostnames from these builders.
 * @see packages/local-edge-core/src/route-plan.ts - Route planner that embeds the same hostname assembly when wiring planned hostname fields.
 * @see consumer local-edge adapter - consumer hostname adapter that maps consumer surfaces to label parts then delegates joining to this core module.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

/** Explicit parts required to build one local-edge hostname. */
export type LocalEdgeCore_HostnameParts = {
  surface: string;
  realmSlug: string;
  method: string;
  developerSlug: string;
  rootZone: string;
};

/** Options for building a surface-to-hostname matrix for one realm. */
export type LocalEdgeCore_HostnameMatrixOptions = Omit<
  LocalEdgeCore_HostnameParts,
  "surface"
> & {
  surfaces: readonly string[];
};

/** Rejects empty hostname segments before joining labels. */
function LocalEdgeCore_assertNonEmptySegment(options: {
  fieldName: string;
  value: string;
}): void {
  if (options.value.trim().length === 0) {
    throw new Error(`local-edge-core-hostname-empty-${options.fieldName}`);
  }
}

/** Builds one hostname from product-neutral surface and realm identity parts. */
export function LocalEdgeCore_buildHostnameFromParts(
  options: LocalEdgeCore_HostnameParts,
): string {
  LocalEdgeCore_assertNonEmptySegment({ fieldName: "surface", value: options.surface });
  LocalEdgeCore_assertNonEmptySegment({ fieldName: "realmSlug", value: options.realmSlug });
  LocalEdgeCore_assertNonEmptySegment({ fieldName: "method", value: options.method });
  LocalEdgeCore_assertNonEmptySegment({ fieldName: "developerSlug", value: options.developerSlug });
  LocalEdgeCore_assertNonEmptySegment({ fieldName: "rootZone", value: options.rootZone });

  return [
    options.surface,
    options.realmSlug,
    options.method,
    options.developerSlug,
    options.rootZone,
  ].join(".");
}

/** Builds a hostname matrix for caller-provided surface labels. */
export function LocalEdgeCore_buildHostnamesForSurfaces(
  options: LocalEdgeCore_HostnameMatrixOptions,
): Record<string, string> {
  const hostnamesBySurface: Record<string, string> = {};

  for (const surface of options.surfaces) {
    hostnamesBySurface[surface] = LocalEdgeCore_buildHostnameFromParts({
      surface,
      realmSlug: options.realmSlug,
      method: options.method,
      developerSlug: options.developerSlug,
      rootZone: options.rootZone,
    });
  }

  return hostnamesBySurface;
}
