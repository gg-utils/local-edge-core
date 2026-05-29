/**
 * @fileoverview Pure path normalization helpers for local-edge artifact layouts.
 *
 * These helpers own deterministic filesystem path derivation for package-level local-edge
 * artifacts. They do not read from process env, inspect a checkout, or encode product-specific
 * app names; adapters pass explicit roots and fallback paths.
 * Flow: explicit roots and overrides -> normalized strings -> callers persist or wire artifacts.
 *
 * @testing Node test: cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/paths.unit.test.ts
 * @testing Node test: cd packages/local-edge-core && npm run test
 *
 * @see packages/local-edge-core/src/method-config.ts - Method-config resolver that imports legacy nginx and cert path normalization from this module when deriving docker and TLS artifact locations.
 * @see packages/local-edge-core/src/paths.unit.test.ts - Node test suite that locks normalization, realm layout, TLS defaults, and active env file collection behavior owned here.
 * @see packages/local-edge-core/src/index.ts - Package barrel that re-exports this path surface for `@gg-utils/local-edge-core` consumers.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - File-overview contract this header follows for verification tooling.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Per-realm artifact paths derived from a package-core realms directory and realm slug. */
export type LocalEdgeCore_RealmArtifactPaths = {
    realmRootDir: string;
    envDir: string;
    healthPath: string;
    metadataPath: string;
};
/** Options used to normalize legacy generated artifact path overrides. */
export type LocalEdgeCore_NormalizeLegacyArtifactPathOptions = {
    configuredPath: string | undefined;
    machineRootDir: string;
    fallbackPath: string;
};
/** Options for collecting an adapter's active local-edge environment source files. */
export type LocalEdgeCore_CollectActiveEnvSourceFilesOptions = {
    projectRoot: string;
    localEdgeRootEnvFile: string | undefined;
    defaultEnvFileName: string;
};
/**
 * Treats paths ending in `generated` as the generated output dir and returns its parent as root.
 */
export declare function LocalEdgeCore_normalizeMachineRootDir(candidatePath: string): string;
/**
 * Maps historical nginx-docker and cert paths under legacy `generated/.../main/` layouts.
 */
export declare function LocalEdgeCore_normalizeLegacyArtifactPath(options: LocalEdgeCore_NormalizeLegacyArtifactPathOptions): string;
/** Resolves the TLS certificate path from an optional override or default generated layout. */
export declare function LocalEdgeCore_resolveTlsCertPath(options: {
    generatedDir: string;
    rawCertPath: string | undefined;
}): string;
/** Resolves the TLS private key path from an optional override or default generated layout. */
export declare function LocalEdgeCore_resolveTlsKeyPath(options: {
    generatedDir: string;
    rawKeyPath: string | undefined;
}): string;
/**
 * Derives per-realm artifact paths from a realm artifacts root and slug.
 */
export declare function LocalEdgeCore_resolveRealmArtifactPaths(options: {
    realmsDir: string;
    realmSlug: string;
}): LocalEdgeCore_RealmArtifactPaths;
/** Returns the default local-edge env file path for a project root and filename. */
export declare function LocalEdgeCore_defaultEnvFilePath(options: {
    projectRoot: string;
    defaultEnvFileName: string;
}): string;
/** Returns ordered, de-duplicated env file paths for an active local-edge stack. */
export declare function LocalEdgeCore_collectActiveEnvSourceFiles(options: LocalEdgeCore_CollectActiveEnvSourceFilesOptions): string[];
//# sourceMappingURL=paths.d.ts.map