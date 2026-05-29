/**
 * @fileoverview Product-neutral config parsing primitives for local-edge adapters.
 *
 * These helpers normalize common local-edge env/config values without reading process env or owning
 * project-specific defaults. Adapters provide the raw strings and key names, then keep product
 * semantics such as app-specific port matrices outside package core.
 *
 * @testing CLI: npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/method-config.ts - Method configuration resolver that imports slug normalization helpers from this module for Docker Compose and artifact path naming.
 * @see packages/local-edge-core/src/config-primitives.unit.test.ts - Node test module that asserts slug, port, boolean-flag, host, and unique-port validation behavior owned here.
 * @see scripts/local-edge/config.ts - Root local-edge adapter config that composes these primitives when translating env text into typed adapter settings.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Normalizes text into a DNS- and path-safe slug for routing identifiers. */
export declare function LocalEdgeCore_normalizeSlug(value: string): string;
/** Normalizes a candidate slug, using the fallback when the primary value normalizes to empty. */
export declare function LocalEdgeCore_normalizeSlugOrFallback(options: {
    value: string;
    fallback: string;
}): string;
/** Parses a required positive integer from raw env/config text for port-style settings. */
export declare function LocalEdgeCore_parseRequiredPositiveInt(options: {
    rawValue: string;
    envName: string;
}): number;
/** Parses a boolean-ish flag with an explicit default when unset or blank. */
export declare function LocalEdgeCore_parseOptionalBooleanFlag(options: {
    rawValue: string | undefined;
    envName: string;
    defaultValue: boolean;
}): boolean;
/** Validates a trimmed non-empty host string or IP literal from env/config text. */
export declare function LocalEdgeCore_parseRequiredHostOrIp(options: {
    rawValue: string;
    envName: string;
}): string;
/** Returns trimmed non-empty text, or null when the input is missing or only whitespace. */
export declare function LocalEdgeCore_parseOptionalTrimmedValue(rawValue: string | undefined): string | null;
/** Ensures each named upstream binding uses a distinct listen port. */
export declare function LocalEdgeCore_assertUniquePorts(entries: readonly {
    name: string;
    port: number;
}[]): void;
//# sourceMappingURL=config-primitives.d.ts.map