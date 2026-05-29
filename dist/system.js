/**
 * @fileoverview Product-neutral system helpers for local-edge adapters and compatibility CLIs.
 *
 * Core owns OS detection, command lookup, interactive-terminal detection, canonical path
 * resolution, artifact writes, and utility validation. Adapters choose which utilities and
 * artifact directories are relevant to their runtime.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/system.unit.test.ts
 *
 * @see packages/local-edge-core/src/index.ts - Package barrel that re-exports this module alongside other local-edge-core primitives consumed by adapters and CLIs.
 * @see packages/local-edge-core/src/tls.ts - TLS helpers that call `LocalEdgeCore_commandExists` from here before touching certificate tooling on disk.
 * @see packages/local-edge-core/src/system.unit.test.ts - Jest regression coverage for `which` resolution, Docker Desktop fallbacks on macOS, paths, and utility validation.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
/** Returns true on macOS. */
export function LocalEdgeCore_isMacos() {
    return process.platform === "darwin";
}
/** Resolves a command path from `$PATH`, with a Docker Desktop fallback on macOS for `docker`. */
export function LocalEdgeCore_resolveCommandPath(commandName) {
    if (commandName.length === 0) {
        return null;
    }
    const result = spawnSync("which", [commandName], {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
    });
    if (result.status === 0) {
        const resolvedPath = result.stdout?.toString("utf-8").trim() ?? "";
        if (resolvedPath.length > 0) {
            return resolvedPath;
        }
    }
    if (commandName !== "docker" || !LocalEdgeCore_isMacos()) {
        return null;
    }
    const homeDir = process.env.HOME ?? "";
    const dockerCliCandidates = [
        "/Applications/Docker.app/Contents/Resources/bin/docker",
        homeDir.length > 0
            ? path.join(homeDir, "Applications", "Docker.app", "Contents", "Resources", "bin", "docker")
            : "",
    ];
    for (const candidatePath of dockerCliCandidates) {
        if (candidatePath.length > 0 && existsSync(candidatePath)) {
            return candidatePath;
        }
    }
    return null;
}
/** Returns true when `commandName` is available on `$PATH`. */
export function LocalEdgeCore_commandExists(commandName) {
    return LocalEdgeCore_resolveCommandPath(commandName) !== null;
}
/** Returns true when stdin and stdout are both TTYs. */
export function LocalEdgeCore_hasInteractiveTerminal() {
    return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}
/** Resolves an absolute canonical path. */
export function LocalEdgeCore_canonicalPath(rawPath) {
    return realpathSync(rawPath);
}
/** Writes content to `<artifactsDir>/<name>`, creating the directory if needed. */
export function LocalEdgeCore_writeArtifact(options) {
    if (!existsSync(options.artifactsDir)) {
        mkdirSync(options.artifactsDir, { recursive: true });
    }
    const filePath = path.join(options.artifactsDir, options.name);
    writeFileSync(filePath, options.content, "utf-8");
}
/** Checks that a utility is available on `$PATH`. */
export function LocalEdgeCore_requireUtility(options) {
    if (LocalEdgeCore_commandExists(options.utility)) {
        return { ok: true };
    }
    return {
        ok: false,
        message: `Required utility not found: ${options.utility}`,
    };
}
//# sourceMappingURL=system.js.map