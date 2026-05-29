/**
 * @fileoverview Product-neutral validation helpers for local-edge adapters and compatibility CLIs.
 *
 * This file owns port bounds, positive-integer parsing, strict-start gating, warn-or-throw
 * orchestration, file-path existence checks, and shell-command token extraction; adapters choose
 * which env keys and paths to validate and how to surface warnings versus hard failures.
 * Flow: parse strings into `{ ok, message }` outcomes, optionally escalate the same message through
 * `LocalEdgeCore_warnOrFail` when `LOCAL_EDGE_STRICT_START` is truthy.
 *
 * @testing Node test runner (tsx): cd packages/local-edge-core && npm run test -- src/validation.unit.test.ts
 *
 * @see packages/local-edge-core/src/index.ts - Package barrel that star-re-exports this module so `@gg-utils/local-edge-core` imports pick up the same validation helpers alongside dns, tls, and CLI primitives.
 * @see packages/local-edge-core/src/system.ts - System helpers that import `LocalEdgeCore_ValidationResult` from here to type utility validation outcomes next to command and path resolution.
 * @see packages/local-edge-core/src/validation.unit.test.ts - `node:test` regression suite that locks the port, integer, strict-start, warn-or-fail, file presence, and command-bin parsing contracts owned here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Defines the audited file-overview tag order, single-line `@testing` and `@see` rules, and trailing `@documentation` metadata enforced on this module header.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Validation outcome returned by pure local-edge check functions. */
export type LocalEdgeCore_ValidationResult = {
    ok: true;
} | {
    ok: false;
    message: string;
};
/** Validates that `value` is a numeric TCP port in range 1..65535. */
export declare function LocalEdgeCore_validatePort(options: {
    label: string;
    value: string;
}): LocalEdgeCore_ValidationResult;
/** Validates that `value` is a numeric integer >= 1. */
export declare function LocalEdgeCore_validatePositiveInteger(options: {
    label: string;
    value: string;
}): LocalEdgeCore_ValidationResult;
/** Returns true when `LOCAL_EDGE_STRICT_START` is truthy in a caller-provided env map. */
export declare function LocalEdgeCore_shouldFailHard(env: Record<string, string | undefined>): boolean;
/** Routes a message to `warnFn` and throws after warning when strict mode is active. */
export declare function LocalEdgeCore_warnOrFail(options: {
    message: string;
    strict: boolean;
    warnFn: (message: string) => void;
}): void;
/** Checks that a file exists at the given path. */
export declare function LocalEdgeCore_requireFilePath(options: {
    filePath: string;
    description: string;
}): LocalEdgeCore_ValidationResult;
/** Extracts the leading binary name from a shell command string. */
export declare function LocalEdgeCore_extractCommandBin(command: string): string;
//# sourceMappingURL=validation.d.ts.map