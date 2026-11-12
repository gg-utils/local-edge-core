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
import { createHash } from "node:crypto";
/** Rejects empty hostname segments before joining labels. */
function LocalEdgeCore_assertNonEmptySegment(options) {
    if (options.value.trim().length === 0) {
        throw new Error(`local-edge-core-hostname-empty-${options.fieldName}`);
    }
}
/** Builds one hostname from product-neutral surface and realm identity parts. */
export function LocalEdgeCore_buildHostnameFromParts(options) {
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
export function LocalEdgeCore_buildHostnamesForSurfaces(options) {
    const hostnamesBySurface = {};
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
/** Longest DNS label allowed by RFC 1035. */
export const LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH = 63;
/** Separator between app and realm in a compact leftmost label, e.g. `web--feature-x`. */
export const LOCAL_EDGE_CORE_COMPACT_REALM_SEPARATOR = "--";
/**
 * Checks one DNS label: lowercase `a-z`, `0-9` and `-` only, 1 to 63 characters, no leading or
 * trailing `-`, and no `--` at positions 3-4 (reserved for IDN prefixes such as `xn--`).
 * Returns a problem description, or null when the label is valid.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkDnsLabel("web"); // null
 * LocalEdgeCore_checkDnsLabel("ab--x"); // "label \"ab--x\" may not have -- at positions 3-4"
 * ```
 */
export function LocalEdgeCore_checkDnsLabel(label) {
    if (label.length === 0) {
        return "label is empty";
    }
    if (label.length > LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH) {
        return `label "${label}" is longer than ${String(LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH)} characters`;
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
        return `label "${label}" may only use lowercase a-z, 0-9 and -`;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
        return `label "${label}" may not start or end with -`;
    }
    if (label.slice(2, 4) === "--") {
        return `label "${label}" may not have -- at positions 3-4`;
    }
    return null;
}
/** Longest DNS name in presentation form (no trailing dot), per RFC 1035. */
export const LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH = 253;
/**
 * Checks every label of a hostname and its total length. A leading `*` label (wildcard) is allowed.
 *
 * @param hostname - Dotted name without a trailing dot, for example a root zone, wildcard or host.
 * @returns One problem per invalid label, plus one when the whole name is longer than 253
 *   characters; empty means valid. Never throws.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkHostnameLabels("*.proj-node1.example.test"); // []
 * LocalEdgeCore_checkHostnameLabels("a.*.example"); // one problem: "*" is only allowed first
 * ```
 */
export function LocalEdgeCore_checkHostnameLabels(hostname) {
    const labels = hostname.split(".");
    const lengthProblems = hostname.length > LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH
        ? [`${hostname.slice(0, 40)}...: name is ${String(hostname.length)} characters, longer than ${String(LOCAL_EDGE_CORE_DNS_NAME_MAX_LENGTH)}`]
        : [];
    return [...lengthProblems, ...labels.flatMap((label, index) => {
            if (index === 0 && label === "*") {
                return [];
            }
            const problem = LocalEdgeCore_checkDnsLabel(label);
            return problem === null ? [] : [`${hostname}: ${problem}`];
        })];
}
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
export function LocalEdgeCore_sanitizeRealmSlug(rawBranch, options = {}) {
    const maxLength = options.maxLength ?? LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH;
    const slug = rawBranch
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (slug.length <= maxLength) {
        return slug;
    }
    const hash = createHash("sha256").update(rawBranch).digest("hex").slice(0, 6);
    const head = slug.slice(0, Math.max(0, maxLength - hash.length - 1)).replace(/-+$/g, "");
    return head.length > 0 ? `${head}-${hash}` : hash.slice(0, maxLength);
}
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
export function LocalEdgeCore_buildCompactLeftLabel(parts) {
    const appProblem = LocalEdgeCore_checkDnsLabel(parts.app);
    if (appProblem !== null) {
        throw new Error(`local-edge-core-hostname-invalid-app: ${appProblem}`);
    }
    if (parts.app.includes(LOCAL_EDGE_CORE_COMPACT_REALM_SEPARATOR)) {
        throw new Error(`local-edge-core-hostname-invalid-app: "${parts.app}" may not contain --`);
    }
    const realm = LocalEdgeCore_sanitizeRealmSlug(parts.realm);
    if (realm.length === 0) {
        throw new Error("local-edge-core-hostname-empty-realm");
    }
    if (realm === (parts.mainRealm ?? "main")) {
        return parts.app;
    }
    if (parts.app.length === 2) {
        throw new Error(`local-edge-core-hostname-short-app: "${parts.app}--<realm>" would put -- at positions 3-4, which DNS reserves for IDN prefixes; ` +
            "give the app an edgeName of 1 or 3+ characters, or a hostnameTemplate, for non-main realms");
    }
    const room = LOCAL_EDGE_CORE_DNS_LABEL_MAX_LENGTH - parts.app.length - LOCAL_EDGE_CORE_COMPACT_REALM_SEPARATOR.length;
    if (room < 8) {
        throw new Error(`local-edge-core-hostname-app-too-long: "${parts.app}" leaves no room for a realm`);
    }
    return `${parts.app}${LOCAL_EDGE_CORE_COMPACT_REALM_SEPARATOR}${LocalEdgeCore_sanitizeRealmSlug(parts.realm, { maxLength: room })}`;
}
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
export function LocalEdgeCore_buildCompactHostname(parts) {
    const hostname = `${LocalEdgeCore_buildCompactLeftLabel(parts)}.${parts.projectMachineLabel}.${parts.rootZone}`;
    const problems = LocalEdgeCore_checkHostnameLabels(hostname);
    if (problems.length > 0) {
        throw new Error(`local-edge-core-hostname-invalid: ${problems.join("; ")}`);
    }
    return hostname;
}
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
export function LocalEdgeCore_renderHostnameTemplate(template, parts) {
    const tokens = {
        app: parts.app,
        realm: LocalEdgeCore_sanitizeRealmSlug(parts.realm),
        projectMachine: parts.projectMachineLabel,
        rootZone: parts.rootZone,
    };
    return template.replace(/\{(\w+)\}/g, (match, token) => {
        if (token === "label") {
            return LocalEdgeCore_buildCompactLeftLabel(parts);
        }
        return tokens[token] ?? match;
    });
}
