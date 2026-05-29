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
import type { LocalEdgeCore_ValidationResult } from "./validation.js";
/** Returns true on macOS. */
export declare function LocalEdgeCore_isMacos(): boolean;
/** Resolves a command path from `$PATH`, with a Docker Desktop fallback on macOS for `docker`. */
export declare function LocalEdgeCore_resolveCommandPath(commandName: string): string | null;
/** Returns true when `commandName` is available on `$PATH`. */
export declare function LocalEdgeCore_commandExists(commandName: string): boolean;
/** Returns true when stdin and stdout are both TTYs. */
export declare function LocalEdgeCore_hasInteractiveTerminal(): boolean;
/** Resolves an absolute canonical path. */
export declare function LocalEdgeCore_canonicalPath(rawPath: string): string;
/** Writes content to `<artifactsDir>/<name>`, creating the directory if needed. */
export declare function LocalEdgeCore_writeArtifact(options: {
    artifactsDir: string;
    name: string;
    content: string;
}): void;
/** Checks that a utility is available on `$PATH`. */
export declare function LocalEdgeCore_requireUtility(options: {
    utility: string;
}): LocalEdgeCore_ValidationResult;
//# sourceMappingURL=system.d.ts.map