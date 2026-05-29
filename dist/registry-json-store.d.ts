/**
 * @fileoverview Generic JSON registry storage with lock coordination and atomic writes for
 * `@gg-utils/local-edge-core` consumers.
 *
 * This file owns filesystem read/validate, bounded lock acquisition, temp-file plus rename writes,
 * and optional prepare-for-write hooks while callers supply schema-specific validators and empty
 * documents.
 * Flow: acquire lock -> read or synthesize empty registry -> caller mutates -> validate/prepare ->
 * write temp JSON -> atomic rename -> release lock.
 *
 * @example
 * ```typescript
 * import {
 *   LocalEdgeCore_readRegistryJsonStore,
 *   type LocalEdgeCore_RegistryJsonStoreOptions,
 * } from "@gg-utils/local-edge-core/registry-json-store";
 *
 * function isCountRegistry(value: unknown): value is { count: number } {
 *   if (typeof value !== "object" || value === null) return false;
 *   if (!("count" in value)) return false;
 *   return typeof value.count === "number";
 * }
 *
 * const store: LocalEdgeCore_RegistryJsonStoreOptions<{ count: number }> = {
 *   registryFilePath: "/tmp/demo-registry.json",
 *   registryLockFilePath: "/tmp/demo-registry.json.lock",
 *   createEmptyRegistry: () => ({ count: 0 }),
 *   validateRegistry: (value) => {
 *     if (!isCountRegistry(value)) throw new Error("demo-registry-invalid");
 *     return value;
 *   },
 *   prepareRegistryForWrite: (registry) => registry,
 *   errorPrefix: "[demo-registry]",
 * };
 *
 * void LocalEdgeCore_readRegistryJsonStore(store);
 * ```
 *
 * @testing Node.js test runner: cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/registry-json-store.unit.test.ts
 *
 * @see packages/local-edge-core/src/registry-json-store.unit.test.ts - Node test suite that locks down missing-file reads, atomic writes, lock lifecycle, and failure cleanup for this store.
 * @see consumer local-edge adapter - consumer realm registry adapter that wires typed validators and filesystem paths into these generic lock/read/write helpers.
 * @see scripts/local-edge/realm-registry.ts - Root compatibility re-export whose header points agents at this module for product-neutral JSON envelope mechanics.
 * @see packages/local-edge-core/src/index.ts - Package barrel that re-exports this registry JSON store for `@gg-utils/local-edge-core` importers.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Validation callback used to project parsed JSON into an adapter-owned registry shape. */
export type LocalEdgeCore_RegistryJsonValidator<TRegistry> = (value: unknown) => TRegistry;
/** Optional callback used to stamp or normalize registry state immediately before writes. */
export type LocalEdgeCore_RegistryJsonPrepareForWrite<TRegistry> = (registry: TRegistry) => TRegistry;
/** Static options that locate and validate one JSON registry store. */
export type LocalEdgeCore_RegistryJsonStoreOptions<TRegistry> = {
    registryFilePath: string;
    registryLockFilePath: string;
    createEmptyRegistry: () => TRegistry;
    validateRegistry: LocalEdgeCore_RegistryJsonValidator<TRegistry>;
    prepareRegistryForWrite: LocalEdgeCore_RegistryJsonPrepareForWrite<TRegistry>;
    lockRetryMs?: number;
    lockMaxAttempts?: number;
    errorPrefix: string;
};
/** Reads and validates a registry JSON file, returning the caller's empty document when absent. */
export declare function LocalEdgeCore_readRegistryJsonStore<TRegistry>(options: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>): Promise<TRegistry>;
/** Validates, prepares, and atomically writes a registry JSON file. */
export declare function LocalEdgeCore_writeRegistryJsonStore<TRegistry>(options: {
    store: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>;
    registry: TRegistry;
}): Promise<void>;
/** Runs a read/mutate/write registry workflow under the exclusive JSON store lock. */
export declare function LocalEdgeCore_withRegistryJsonLock<TRegistry, TResult>(options: {
    store: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>;
    operation: (registry: TRegistry) => Promise<TResult>;
}): Promise<TResult>;
//# sourceMappingURL=registry-json-store.d.ts.map