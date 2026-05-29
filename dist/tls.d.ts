/**
 * @fileoverview TLS certificate material planning, generation, and host trust or Tailscale suffix
 * detection helpers for local-edge core.
 *
 * This file owns mkcert, self-signed OpenSSL, and provided-file certificate modes plus injectable
 * filesystem and command runners. It also exposes product-neutral mkcert trust detection and
 * Tailscale MagicDNS suffix resolution; adapters still decide hostname catalogs, trust-store
 * policy, dry-run gating, and user prompts.
 * Flow: TLS mode -> validate or generate cert/key -> optional warning strings for callers.
 *
 * @testing Jest unit: npm run test --prefix packages/local-edge-core -- src/tls.unit.test.ts
 *
 * @see packages/local-edge-core/src/tls.unit.test.ts - Jest regression coverage for ensureTlsFiles modes, mkcert trust heuristics, and Tailscale JSON suffix parsing owned by this module.
 * @see packages/local-edge-kit/src/lifecycle-plans.ts - Kit lifecycle planner that imports mkcert trust detection from core when deriving setup and doctor guidance for local-edge adapters.
 * @see scripts/local-edge/lib-tls.ts - Root script compatibility re-export that aliases these exports for legacy local-edge TypeScript callers outside the package graph.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Product-neutral TLS material strategy. */
export type LocalEdgeCore_TlsMode = "mkcert" | "self-signed" | "provided";
/** Synchronous command runner used for certificate generator commands. */
export type LocalEdgeCore_TlsCommandRunner = (command: string, args: readonly string[]) => void;
/** Host filesystem operations used by TLS generation. */
export type LocalEdgeCore_TlsFileSystem = {
    fileExists(filePath: string): boolean;
    ensureDirectory(directoryPath: string): Promise<void>;
};
/** Injectable dependencies for tests and adapter-specific process wrappers. */
export type LocalEdgeCore_TlsDependencies = {
    fileSystem: LocalEdgeCore_TlsFileSystem;
    runCommand: LocalEdgeCore_TlsCommandRunner;
};
/** Synchronous command result used by host TLS/trust probes. */
export type LocalEdgeCore_TlsProbeCommandResult = {
    readonly status: number | null;
    readonly stdout: string | null;
};
/** Injectable host dependencies for mkcert trust and tailnet suffix detection. */
export type LocalEdgeCore_TlsProbeDependencies = {
    readonly commandExists: (command: string) => boolean;
    readonly fileExists: (filePath: string) => boolean;
    readonly homeDir: string;
    readonly runCommand: (command: string, args: readonly string[], timeoutMs: number) => LocalEdgeCore_TlsProbeCommandResult;
};
/** Options for ensuring a certificate/key pair exists. */
export type LocalEdgeCore_EnsureTlsFilesOptions = {
    mode: LocalEdgeCore_TlsMode;
    certPath: string;
    keyPath: string;
    hostnames: readonly string[];
    forceRegenerate: boolean;
    reuseExisting: boolean;
    messagePrefix: string;
    dependencies?: LocalEdgeCore_TlsDependencies;
};
/** Ensures TLS certificate and key files exist according to the configured TLS mode. */
export declare function LocalEdgeCore_ensureTlsFiles(options: LocalEdgeCore_EnsureTlsFilesOptions): Promise<string[]>;
/**
 * Returns true when mkcert's root CA exists and appears trusted by the host certificate store.
 *
 * @remarks
 * This mirrors the legacy local-edge helper without knowing any adapter-specific hostname catalog.
 */
export declare function LocalEdgeCore_mkcertTrustDetected(dependencies?: LocalEdgeCore_TlsProbeDependencies): boolean;
/**
 * Detects the current Tailscale MagicDNS suffix from `tailscale status --json`.
 *
 * @remarks
 * `CurrentTailnet.MagicDNSSuffix` wins over the legacy top-level `MagicDNSSuffix` field.
 */
export declare function LocalEdgeCore_detectTailnetSuffix(dependencies?: LocalEdgeCore_TlsProbeDependencies): string | null;
/** Resolves a configured, auto-detected, or default Tailscale MagicDNS suffix. */
export declare function LocalEdgeCore_resolveTailnetSuffix(configuredValue: string, dependencies?: LocalEdgeCore_TlsProbeDependencies): string;
//# sourceMappingURL=tls.d.ts.map