/**
 * @fileoverview Owns the product-neutral local-edge realm registry schema, runtime validation, and
 * envelope construction helpers shared across `@gg-utils/local-edge-core` consumers.
 *
 * Registry types model routing state without product-specific branch, package, framework, or
 * worktree metadata; adapters project legacy or product-owned records into these shapes and may
 * attach private fields under `adapterMetadata`.
 * Flow: unknown JSON -> `LocalEdgeCore_validateRealmRecord` -> typed `LocalEdgeCore_RealmRecord` ->
 * optional `LocalEdgeCore_createRealmRegistryFile` envelope for persistence-oriented callers.
 *
 * @example
 * ```typescript
 * import {
 *   LocalEdgeCore_validateRealmRecord,
 *   type LocalEdgeCore_RealmRecord,
 * } from "@gg-utils/local-edge-core/registry";
 *
 * function acceptAdapterProjectedRow(row: LocalEdgeCore_RealmRecord): void {
 *   LocalEdgeCore_validateRealmRecord(row);
 * }
 * ```
 *
 * @testing Node.js test runner: cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/registry.unit.test.ts
 *
 * @see packages/local-edge-core/src/registry-json-store.ts - Lock-backed JSON store that wires caller-supplied validators (including realm-shaped documents) through read/prepare/write paths adjacent to this contract.
 * @see packages/local-edge-core/src/route-plan.ts - Manifest-driven route planner that imports realm validation and types from this module when resolving hostnames and upstream targets.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository file-overview contract governing this header block.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Current neutral package-core realm registry schema version. */
export declare const LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION = 2;
/** Runtime lifecycle state for one neutral local-edge realm row. */
export type LocalEdgeCore_RealmStatus = "active" | "inactive" | "stale";
/** Hostname tuple used by package-core hostname/origin builders. */
export type LocalEdgeCore_RealmHostnameParts = {
    developerSlug: string;
    rootZone: string;
};
/** Workspace identity for a neutral realm record. */
export type LocalEdgeCore_RealmWorkspace = {
    type: string;
    path: string;
};
/** Upstream endpoint attached to a neutral realm record. */
export type LocalEdgeCore_RealmUpstream = {
    host: string;
    port: number;
};
/** Filesystem artifact paths attached to a neutral realm record. */
export type LocalEdgeCore_RealmRegistryArtifactPaths = {
    realmRoot: string;
    metadataPath?: string;
    envDir?: string;
};
/** ISO timestamp fields tracking neutral realm lifecycle. */
export type LocalEdgeCore_RealmTimestamps = {
    createdAt: string;
    registeredAt: string;
    lastSeenAt: string;
};
/** Product-neutral realm record consumed by package-core registry and router APIs. */
export type LocalEdgeCore_RealmRecord = {
    schemaVersion: typeof LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION;
    realmSlug: string;
    status: LocalEdgeCore_RealmStatus;
    method: string;
    hostnameParts: LocalEdgeCore_RealmHostnameParts;
    workspace: LocalEdgeCore_RealmWorkspace;
    upstreams: Record<string, LocalEdgeCore_RealmUpstream>;
    artifactPaths: LocalEdgeCore_RealmRegistryArtifactPaths;
    timestamps: LocalEdgeCore_RealmTimestamps;
    adapterMetadata?: Record<string, unknown>;
};
/** Neutral registry envelope used after adapters project product-owned records. */
export type LocalEdgeCore_RealmRegistryFile = {
    schemaVersion: typeof LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION;
    updatedAt: string;
    realms: Record<string, LocalEdgeCore_RealmRecord>;
};
/** Validates a neutral realm status value. */
export declare function LocalEdgeCore_validateRealmStatus(value: unknown): LocalEdgeCore_RealmStatus;
/** Validates one neutral realm record. */
export declare function LocalEdgeCore_validateRealmRecord(value: unknown): LocalEdgeCore_RealmRecord;
/** Builds and validates a neutral registry envelope from already-projected realm records. */
export declare function LocalEdgeCore_createRealmRegistryFile(options: {
    updatedAt: string;
    realms: readonly LocalEdgeCore_RealmRecord[];
}): LocalEdgeCore_RealmRegistryFile;
//# sourceMappingURL=registry.d.ts.map