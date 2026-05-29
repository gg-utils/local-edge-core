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
export function LocalEdgeCore_normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalizes a candidate slug, using the fallback when the primary value normalizes to empty. */
export function LocalEdgeCore_normalizeSlugOrFallback(options: {
  value: string;
  fallback: string;
}): string {
  const normalized = LocalEdgeCore_normalizeSlug(options.value);
  if (normalized.length > 0) {
    return normalized;
  }
  return LocalEdgeCore_normalizeSlug(options.fallback);
}

/** Parses a required positive integer from raw env/config text for port-style settings. */
export function LocalEdgeCore_parseRequiredPositiveInt(options: {
  rawValue: string;
  envName: string;
}): number {
  const parsed = Number.parseInt(options.rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `[local-edge:config] ${options.envName} must be a positive integer. ` +
        `Received '${options.rawValue}'.`,
    );
  }
  return parsed;
}

/** Parses a boolean-ish flag with an explicit default when unset or blank. */
export function LocalEdgeCore_parseOptionalBooleanFlag(options: {
  rawValue: string | undefined;
  envName: string;
  defaultValue: boolean;
}): boolean {
  if (!options.rawValue || options.rawValue.trim().length === 0) {
    return options.defaultValue;
  }

  const normalized = options.rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `[local-edge:config] ${options.envName} must be a boolean flag ` +
      `(true/false, 1/0, yes/no, on/off). Received '${options.rawValue}'.`,
  );
}

/** Validates a trimmed non-empty host string or IP literal from env/config text. */
export function LocalEdgeCore_parseRequiredHostOrIp(options: {
  rawValue: string;
  envName: string;
}): string {
  const normalized = options.rawValue.trim();
  if (!normalized || normalized.length === 0) {
    throw new Error(
      `[local-edge:config] ${options.envName} must be a non-empty host/IP value.`,
    );
  }
  return normalized;
}

/** Returns trimmed non-empty text, or null when the input is missing or only whitespace. */
export function LocalEdgeCore_parseOptionalTrimmedValue(
  rawValue: string | undefined,
): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Ensures each named upstream binding uses a distinct listen port. */
export function LocalEdgeCore_assertUniquePorts(
  entries: readonly { name: string; port: number }[],
): void {
  const seenPorts = new Map<number, string>();
  for (const entry of entries) {
    const existingName = seenPorts.get(entry.port);
    if (existingName) {
      throw new Error(
        `[local-edge:config] Port collision: ${entry.name} and ${existingName} ` +
          `both resolved to ${entry.port}.`,
      );
    }
    seenPorts.set(entry.port, entry.name);
  }
}
