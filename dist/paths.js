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
import path from "node:path";
/** Collapses repeated slash characters in a path-like string without resolving segments. */
function LocalEdgeCore_collapseSlashes(input) {
    let out = "";
    let lastWasSlash = false;
    for (const ch of input) {
        if (ch === "/") {
            if (!lastWasSlash) {
                out += "/";
            }
            lastWasSlash = true;
        }
        else {
            lastWasSlash = false;
            out += ch;
        }
    }
    return out;
}
/**
 * Treats paths ending in `generated` as the generated output dir and returns its parent as root.
 */
export function LocalEdgeCore_normalizeMachineRootDir(candidatePath) {
    if (path.basename(candidatePath) === "generated") {
        return path.dirname(candidatePath);
    }
    return candidatePath;
}
/**
 * Maps historical nginx-docker and cert paths under legacy `generated/.../main/` layouts.
 */
export function LocalEdgeCore_normalizeLegacyArtifactPath(options) {
    if (!options.configuredPath || options.configuredPath.trim().length === 0) {
        return options.fallbackPath;
    }
    const normalizedPath = LocalEdgeCore_collapseSlashes(options.configuredPath);
    const normalizedMachineRoot = LocalEdgeCore_collapseSlashes(options.machineRootDir);
    if (normalizedPath.endsWith("/generated/nginx-docker/main/docker-compose.yml")) {
        return LocalEdgeCore_collapseSlashes(path.join(normalizedMachineRoot, "router", "nginx-docker", "docker-compose.yml"));
    }
    if (normalizedPath.endsWith("/generated/nginx-docker/main/nginx.conf")) {
        return LocalEdgeCore_collapseSlashes(path.join(normalizedMachineRoot, "router", "nginx-docker", "nginx.conf"));
    }
    const certsMarker = "/generated/certs/";
    const certsIndex = normalizedPath.indexOf(certsMarker);
    if (certsIndex >= 0) {
        const tail = normalizedPath.slice(certsIndex + certsMarker.length);
        return LocalEdgeCore_collapseSlashes(path.join(normalizedMachineRoot, "certs", tail));
    }
    return options.configuredPath;
}
/** Resolves the TLS certificate path from an optional override or default generated layout. */
export function LocalEdgeCore_resolveTlsCertPath(options) {
    return LocalEdgeCore_normalizeLegacyArtifactPath({
        configuredPath: options.rawCertPath,
        machineRootDir: options.generatedDir,
        fallbackPath: path.join(options.generatedDir, "certs", "local-edge-cert.pem"),
    });
}
/** Resolves the TLS private key path from an optional override or default generated layout. */
export function LocalEdgeCore_resolveTlsKeyPath(options) {
    return LocalEdgeCore_normalizeLegacyArtifactPath({
        configuredPath: options.rawKeyPath,
        machineRootDir: options.generatedDir,
        fallbackPath: path.join(options.generatedDir, "certs", "local-edge-key.pem"),
    });
}
/**
 * Derives per-realm artifact paths from a realm artifacts root and slug.
 */
export function LocalEdgeCore_resolveRealmArtifactPaths(options) {
    const realmRootDir = path.join(options.realmsDir, options.realmSlug);
    return {
        realmRootDir,
        envDir: path.join(realmRootDir, "env"),
        healthPath: path.join(realmRootDir, "health.json"),
        metadataPath: path.join(realmRootDir, "metadata.json"),
    };
}
/** Returns the default local-edge env file path for a project root and filename. */
export function LocalEdgeCore_defaultEnvFilePath(options) {
    return path.join(options.projectRoot, options.defaultEnvFileName);
}
/** Returns ordered, de-duplicated env file paths for an active local-edge stack. */
export function LocalEdgeCore_collectActiveEnvSourceFiles(options) {
    const defaultFile = LocalEdgeCore_defaultEnvFilePath({
        projectRoot: options.projectRoot,
        defaultEnvFileName: options.defaultEnvFileName,
    });
    const candidates = [options.localEdgeRootEnvFile, defaultFile];
    const seen = new Set();
    const result = [];
    for (const candidate of candidates) {
        if (candidate === undefined || candidate.trim().length === 0) {
            continue;
        }
        if (seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        result.push(candidate);
    }
    return result;
}
//# sourceMappingURL=paths.js.map