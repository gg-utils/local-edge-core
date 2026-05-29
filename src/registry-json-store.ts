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

import fs from "node:fs/promises";
import path from "node:path";

/** Validation callback used to project parsed JSON into an adapter-owned registry shape. */
export type LocalEdgeCore_RegistryJsonValidator<TRegistry> = (
  value: unknown,
) => TRegistry;

/** Optional callback used to stamp or normalize registry state immediately before writes. */
export type LocalEdgeCore_RegistryJsonPrepareForWrite<TRegistry> = (
  registry: TRegistry,
) => TRegistry;

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

const LOCAL_EDGE_CORE_REGISTRY_DEFAULT_LOCK_RETRY_MS = 100;
const LOCAL_EDGE_CORE_REGISTRY_DEFAULT_LOCK_MAX_ATTEMPTS = 50;

/** Async sleep used for bounded lock acquisition polling. */
const LocalEdgeCore_sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Converts an unknown thrown value into a diagnostic string. */
const LocalEdgeCore_errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Returns whether an I/O error message represents a missing file. */
const LocalEdgeCore_isMissingFileError = (error: unknown): boolean =>
  LocalEdgeCore_errorMessage(error).includes("ENOENT");

/** Returns whether an I/O error message represents an existing lock file. */
const LocalEdgeCore_isExistingLockError = (error: unknown): boolean =>
  LocalEdgeCore_errorMessage(error).includes("EEXIST");

/** Acquires an exclusive lock by creating the lock file, retrying while it exists. */
async function LocalEdgeCore_acquireRegistryJsonLock<TRegistry>(
  options: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>,
): Promise<void> {
  const lockRetryMs = options.lockRetryMs ?? LOCAL_EDGE_CORE_REGISTRY_DEFAULT_LOCK_RETRY_MS;
  const lockMaxAttempts =
    options.lockMaxAttempts ?? LOCAL_EDGE_CORE_REGISTRY_DEFAULT_LOCK_MAX_ATTEMPTS;

  await fs.mkdir(path.dirname(options.registryLockFilePath), { recursive: true });

  for (let attempt = 0; attempt < lockMaxAttempts; attempt += 1) {
    try {
      const handle = await fs.open(options.registryLockFilePath, "wx");
      await handle.close();
      return;
    } catch (error) {
      if (!LocalEdgeCore_isExistingLockError(error)) {
        throw error;
      }
      await LocalEdgeCore_sleep(lockRetryMs);
    }
  }

  throw new Error(`${options.errorPrefix} Timed out waiting for registry lock.`);
}

/** Releases a registry lock, ignoring already-absent lock files. */
async function LocalEdgeCore_releaseRegistryJsonLock<TRegistry>(
  options: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>,
): Promise<void> {
  await fs.rm(options.registryLockFilePath, { force: true });
}

/** Reads and validates a registry JSON file, returning the caller's empty document when absent. */
export async function LocalEdgeCore_readRegistryJsonStore<TRegistry>(
  options: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>,
): Promise<TRegistry> {
  try {
    const raw = await fs.readFile(options.registryFilePath, "utf8");
    return options.validateRegistry(JSON.parse(raw));
  } catch (error) {
    if (LocalEdgeCore_isMissingFileError(error)) {
      return options.createEmptyRegistry();
    }
    throw error;
  }
}

/** Validates, prepares, and atomically writes a registry JSON file. */
export async function LocalEdgeCore_writeRegistryJsonStore<TRegistry>(options: {
  store: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>;
  registry: TRegistry;
}): Promise<void> {
  const validated = options.store.validateRegistry(options.registry);
  const prepared = options.store.prepareRegistryForWrite(validated);
  const registryPath = options.store.registryFilePath;
  const tempPath = `${registryPath}.tmp-${process.pid}`;

  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, registryPath);
}

/** Runs a read/mutate/write registry workflow under the exclusive JSON store lock. */
export async function LocalEdgeCore_withRegistryJsonLock<TRegistry, TResult>(options: {
  store: LocalEdgeCore_RegistryJsonStoreOptions<TRegistry>;
  operation: (registry: TRegistry) => Promise<TResult>;
}): Promise<TResult> {
  await LocalEdgeCore_acquireRegistryJsonLock(options.store);
  try {
    const registry = await LocalEdgeCore_readRegistryJsonStore(options.store);
    const result = await options.operation(registry);
    await LocalEdgeCore_writeRegistryJsonStore({
      store: options.store,
      registry,
    });
    return result;
  } finally {
    await LocalEdgeCore_releaseRegistryJsonLock(options.store);
  }
}
