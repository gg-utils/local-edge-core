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
export const LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION = 2;
/** Type guard for parsed JSON object maps. */
function LocalEdgeCore_isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Reads a required string property from a parsed registry object. */
function LocalEdgeCore_requiredString(options) {
    const fieldValue = options.value[options.key];
    if (typeof fieldValue !== "string" || fieldValue.length === 0) {
        throw new Error(`${options.errorPrefix} missing-string-${options.key}`);
    }
    return fieldValue;
}
/** Reads a required positive numeric property from a parsed registry object. */
function LocalEdgeCore_requiredPositiveNumber(options) {
    const fieldValue = options.value[options.key];
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 1) {
        throw new Error(`${options.errorPrefix} missing-positive-number-${options.key}`);
    }
    return fieldValue;
}
/** Reads a required child object from a parsed registry object. */
function LocalEdgeCore_requiredRecord(options) {
    const fieldValue = options.value[options.key];
    if (!LocalEdgeCore_isRecord(fieldValue)) {
        throw new Error(`${options.errorPrefix} missing-record-${options.key}`);
    }
    return fieldValue;
}
/** Validates a neutral realm status value. */
export function LocalEdgeCore_validateRealmStatus(value) {
    if (value === "active" || value === "inactive" || value === "stale") {
        return value;
    }
    throw new Error("[local-edge-core:registry] unsupported-realm-status");
}
/** Validates one neutral upstream endpoint. */
function LocalEdgeCore_validateRealmUpstream(options) {
    const errorPrefix = `[local-edge-core:registry] upstream-${options.upstreamId}`;
    if (!LocalEdgeCore_isRecord(options.value)) {
        throw new Error(`${errorPrefix} must-be-record`);
    }
    return {
        host: LocalEdgeCore_requiredString({
            value: options.value,
            key: "host",
            errorPrefix,
        }),
        port: LocalEdgeCore_requiredPositiveNumber({
            value: options.value,
            key: "port",
            errorPrefix,
        }),
    };
}
/** Validates one neutral realm record. */
export function LocalEdgeCore_validateRealmRecord(value) {
    const errorPrefix = "[local-edge-core:registry] realm-record";
    if (!LocalEdgeCore_isRecord(value)) {
        throw new Error(`${errorPrefix} must-be-record`);
    }
    if (value["schemaVersion"] !== LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION) {
        throw new Error(`${errorPrefix} unsupported-schema-version`);
    }
    const hostnameParts = LocalEdgeCore_requiredRecord({ value, key: "hostnameParts", errorPrefix });
    const workspace = LocalEdgeCore_requiredRecord({ value, key: "workspace", errorPrefix });
    const upstreamsValue = LocalEdgeCore_requiredRecord({ value, key: "upstreams", errorPrefix });
    const artifactPaths = LocalEdgeCore_requiredRecord({ value, key: "artifactPaths", errorPrefix });
    const timestamps = LocalEdgeCore_requiredRecord({ value, key: "timestamps", errorPrefix });
    const adapterMetadata = value["adapterMetadata"];
    const upstreams = {};
    for (const [upstreamId, upstreamValue] of Object.entries(upstreamsValue)) {
        upstreams[upstreamId] = LocalEdgeCore_validateRealmUpstream({
            value: upstreamValue,
            upstreamId,
        });
    }
    if (adapterMetadata !== undefined && !LocalEdgeCore_isRecord(adapterMetadata)) {
        throw new Error(`${errorPrefix} adapterMetadata-must-be-record`);
    }
    const record = {
        schemaVersion: LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
        realmSlug: LocalEdgeCore_requiredString({ value, key: "realmSlug", errorPrefix }),
        status: LocalEdgeCore_validateRealmStatus(value["status"]),
        method: LocalEdgeCore_requiredString({ value, key: "method", errorPrefix }),
        hostnameParts: {
            developerSlug: LocalEdgeCore_requiredString({
                value: hostnameParts,
                key: "developerSlug",
                errorPrefix,
            }),
            rootZone: LocalEdgeCore_requiredString({
                value: hostnameParts,
                key: "rootZone",
                errorPrefix,
            }),
        },
        workspace: {
            type: LocalEdgeCore_requiredString({ value: workspace, key: "type", errorPrefix }),
            path: LocalEdgeCore_requiredString({ value: workspace, key: "path", errorPrefix }),
        },
        upstreams,
        artifactPaths: {
            realmRoot: LocalEdgeCore_requiredString({
                value: artifactPaths,
                key: "realmRoot",
                errorPrefix,
            }),
            metadataPath: typeof artifactPaths["metadataPath"] === "string"
                ? artifactPaths["metadataPath"]
                : undefined,
            envDir: typeof artifactPaths["envDir"] === "string" ? artifactPaths["envDir"] : undefined,
        },
        timestamps: {
            createdAt: LocalEdgeCore_requiredString({ value: timestamps, key: "createdAt", errorPrefix }),
            registeredAt: LocalEdgeCore_requiredString({
                value: timestamps,
                key: "registeredAt",
                errorPrefix,
            }),
            lastSeenAt: LocalEdgeCore_requiredString({
                value: timestamps,
                key: "lastSeenAt",
                errorPrefix,
            }),
        },
    };
    if (LocalEdgeCore_isRecord(adapterMetadata)) {
        record.adapterMetadata = adapterMetadata;
    }
    return record;
}
/** Builds and validates a neutral registry envelope from already-projected realm records. */
export function LocalEdgeCore_createRealmRegistryFile(options) {
    const realms = {};
    for (const record of options.realms) {
        const validated = LocalEdgeCore_validateRealmRecord(record);
        realms[validated.realmSlug] = validated;
    }
    return {
        schemaVersion: LOCAL_EDGE_CORE_REALM_REGISTRY_SCHEMA_VERSION,
        updatedAt: options.updatedAt,
        realms,
    };
}
//# sourceMappingURL=registry.js.map