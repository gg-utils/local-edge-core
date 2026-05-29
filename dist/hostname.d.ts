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
export type LocalEdgeCore_HostnameMatrixOptions = Omit<LocalEdgeCore_HostnameParts, "surface"> & {
    surfaces: readonly string[];
};
/** Builds one hostname from product-neutral surface and realm identity parts. */
export declare function LocalEdgeCore_buildHostnameFromParts(options: LocalEdgeCore_HostnameParts): string;
/** Builds a hostname matrix for caller-provided surface labels. */
export declare function LocalEdgeCore_buildHostnamesForSurfaces(options: LocalEdgeCore_HostnameMatrixOptions): Record<string, string>;
//# sourceMappingURL=hostname.d.ts.map