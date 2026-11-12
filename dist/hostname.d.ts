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
/** Longest DNS label allowed by RFC 1035. */
export declare const LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH = 63;
/** Separator between app and realm in a compact leftmost label, e.g. `web--feature-x`. */
export declare const LOCAL_EDGE_CORE_COMPACT_REALM_SEPARATOR = "--";
/**
 * Checks one DNS label: lowercase `a-z`, `0-9` and `-` only, 1 to 63 characters, no leading or
 * trailing `-`, and no `--` at positions 3-4 (reserved for IDN prefixes such as `xn--`).
 * Returns a problem description, or null when the label is valid.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkDnsLabel("web"); // null
 * LocalEdgeCore_checkDnsLabel("ab--x"); // "label (4 characters) may not have -- at positions 3-4"
 * ```
 */
export declare function LocalEdgeCore_checkDnsLabel(label: string): string | null;
/** Longest DNS name in presentation form (no trailing dot), per RFC 1035. */
export declare const LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH = 253;
/**
 * Checks every label of a hostname and its total length. A leading `*` label (wildcard) is allowed.
 *
 * @param hostname - Dotted name without a trailing dot, for example a root zone, wildcard or host.
 * @returns One problem per invalid label, plus one when the whole name is longer than 253
 *   characters; empty means valid. Never throws. A problem names the length and the position of
 *   the label, and never repeats any part of the name.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkHostnameLabels("*.proj-node1.example.test"); // []
 * LocalEdgeCore_checkHostnameLabels("a.*.example"); // one problem: "*" is only allowed first
 * ```
 */
export declare function LocalEdgeCore_checkHostnameLabels(hostname: string): string[];
/**
 * Sanitizes a branch or worktree name into a realm slug: lowercase, every run of other
 * characters becomes one `-`, no leading or trailing `-`, and never `--` (so the compact
 * separator stays unambiguous). When longer than `maxLength`, the slug is cut and a 6-character
 * hash of the original name is appended so distinct long branches stay distinct.
 *
 * @param rawBranch - Branch or worktree name.
 * @param options - `maxLength`, default 63.
 * @returns The slug; may be empty when the name has no letters or digits.
 * @example
 * ```typescript
 * LocalEdgeCore_sanitizeRealmSlug("Feat/Login__Page"); // "feat-login-page"
 * ```
 */
export declare function LocalEdgeCore_sanitizeRealmSlug(rawBranch: string, options?: {
    maxLength?: number | undefined;
}): string;
/** Parts for the compact hostname shape. */
export type LocalEdgeCore_CompactHostnameParts = {
    app: string;
    realm: string;
    /** Realm that gets the plain `<app>` label. Defaults to `main`. */
    mainRealm?: string | undefined;
    /** One label naming the project and machine, for example `proj-node1`. */
    projectMachineLabel: string;
    rootZone: string;
};
/**
 * Builds the leftmost label of a compact hostname: `<app>` for the main realm, otherwise
 * `<app>--<realm>`, shortening the realm (with a hash) so the label fits in 63 characters.
 *
 * @throws When the app label is invalid or too long to leave room for a realm, or when a
 *   two-character app is used in a non-main realm: `ab--<realm>` would put `--` at positions 3-4,
 *   which DNS reserves for IDN prefixes. Give such an app an `edgeName` of 1 or 3+ characters, or a
 *   `hostnameTemplate`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildCompactLeftLabel({ app: "web", realm: "Feat/X", projectMachineLabel: "proj-node1", rootZone: "example.test" });
 * // "web--feat-x"
 * ```
 */
export declare function LocalEdgeCore_buildCompactLeftLabel(parts: LocalEdgeCore_CompactHostnameParts): string;
/**
 * Builds a compact hostname, `<app>.<projectMachine>.<rootZone>` or
 * `<app>--<realm>.<projectMachine>.<rootZone>`, so one wildcard `*.<projectMachine>.<rootZone>` covers every app and realm.
 *
 * @throws When any label is invalid.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildCompactHostname({ app: "web", realm: "main", projectMachineLabel: "proj-node1", rootZone: "example.test" });
 * // "web.proj-node1.example.test"
 * ```
 */
export declare function LocalEdgeCore_buildCompactHostname(parts: LocalEdgeCore_CompactHostnameParts): string;
/**
 * Fills a hostname template. Tokens: `{app}`, `{realm}`, `{label}` (the compact leftmost label),
 * `{projectMachine}` and `{rootZone}`. Unknown tokens are left in place so validation rejects them.
 *
 * @param template - Template text.
 * @param parts - App, realm and zone parts.
 * @returns The filled template; not validated.
 * @throws When `{label}` is used and the compact label cannot be built.
 * @example
 * ```typescript
 * LocalEdgeCore_renderHostnameTemplate("{app}.{projectMachine}.{rootZone}", parts); // "web.proj-node1.example.test"
 * ```
 */
export declare function LocalEdgeCore_renderHostnameTemplate(template: string, parts: LocalEdgeCore_CompactHostnameParts): string;
