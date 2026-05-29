/**
 * @fileoverview Product-neutral doctor summary helpers for local-edge registry artifacts.
 *
 * Package core owns loose JSON summarization, render-artifact formatting, active-realm TLS wildcard
 * collection, argv/usage parsing, and workspace/realm registration checks. Adapters own the
 * surrounding doctor command orchestration, host probes, product-specific remediation text, file IO,
 * and shell wrapper compatibility; the filesystem verification wrapper remains for legacy direct
 * imports until every script adapter consumes the payload-based helper.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test
 *
 * @see packages/local-edge-core/src/doctor.unit.test.ts - Jest regression coverage for registry summarization, argv parsing, workspace verification, TLS wildcards, and doctor log line helpers owned here.
 * @see packages/local-edge-kit/src/doctor-core-cli.ts - Kit CLI adapter that reads registry JSON from disk and dispatches subcommands by calling these helpers for stdout and stderr lines.
 * @see scripts/local-edge/doctor-core.ts - Historical thin wrapper that preserves the legacy doctor script path while delegating to kit and script layers that import this module.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Stable prefix for every doctor log line consumed by operators and tests. */
export declare const LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX = "[local-edge:doctor]";
/** Argv/usage failures from doctor compatibility CLI surfaces. */
export declare class LocalEdgeCoreDoctorError extends Error {
    /**
     * Builds a named error for argv parsing and other doctor-core CLI contract violations.
     *
     * @param message - Human-readable reason printed after the doctor log prefix.
     */
    constructor(message: string);
}
/** Realm counts broken down by status from a registry payload. */
export type LocalEdgeCore_DoctorRegistrySummary = {
    readonly schemaVersionDisplay: string;
    readonly realmCount: number;
    readonly active: number;
    readonly inactive: number;
    readonly stale: number;
};
/** Result of verifying workspace realm registration. */
export type LocalEdgeCore_DoctorVerifyWorkspaceRegistrationResult = {
    readonly ok: true;
    readonly line: string;
} | {
    readonly ok: false;
    readonly stderrLine: string;
    readonly exitCode: 1;
    readonly kind: "registry_missing" | "not_registered";
};
/** Summary of a render artifact payload. */
export type LocalEdgeCore_DoctorRenderArtifactSummary = {
    readonly runAtDisplay: string;
    readonly realmsJoined: string;
    readonly generatedFileCount: number;
};
/** Options for {@link LocalEdgeCore_doctorVerifyWorkspaceRegistration}. */
export type LocalEdgeCore_DoctorVerifyWorkspaceRegistrationOptions = {
    readonly registryPath: string;
    readonly workspacePath: string;
    readonly expectedRealmSlug: string;
};
/** Options for payload-based workspace registration verification. */
export type LocalEdgeCore_DoctorVerifyWorkspaceRegistrationPayloadOptions = {
    readonly registryPath: string;
    readonly workspacePath: string;
    readonly expectedRealmSlug: string;
    readonly payload: unknown;
};
/** Parsed compatibility CLI commands supported by generic doctor helper entrypoints. */
export type LocalEdgeCore_DoctorCliCommand = {
    readonly command: "help";
} | {
    readonly command: "print-registry-line";
    readonly registryPath: string;
} | {
    readonly command: "verify-root-workspace";
    readonly registryPath: string;
    readonly workspacePath: string;
    readonly realmSlug: string;
} | {
    readonly command: "print-render-line";
    readonly artifactPath: string;
} | {
    readonly command: "print-tls-wildcards";
    readonly registryPath: string;
};
/**
 * Extracts `realms` rows using `Object.values`, including array-backed realm containers.
 *
 * @remarks
 * This intentionally stays loose to preserve legacy doctor behavior for partially written or older
 * registry payloads.
 */
export declare function LocalEdgeCore_doctorRealmValuesFromPayload(payload: unknown): unknown[];
/**
 * Parses registry/render JSON text for downstream loose summarization.
 *
 * @throws {SyntaxError} When `jsonText` is not valid JSON.
 * @throws {LocalEdgeCoreDoctorError} When the parsed JSON root is not an object.
 */
export declare function LocalEdgeCore_doctorParseJsonText(jsonText: string): unknown;
/** Renders product-neutral doctor-core subcommand help without writing to stdout. */
export declare function LocalEdgeCore_doctorRenderUsage(): string;
/**
 * Maps raw argv after the script path into the generic doctor command envelope.
 *
 * @throws {LocalEdgeCoreDoctorError} When a command is unknown or a required flag is missing.
 */
export declare function LocalEdgeCore_doctorParseArgv(argv: readonly string[]): LocalEdgeCore_DoctorCliCommand;
/** Counts realm rows by status for the doctor registry line. */
export declare function LocalEdgeCore_doctorSummarizeRegistryPayload(payload: unknown): LocalEdgeCore_DoctorRegistrySummary;
/** Formats the registry integrity line emitted before realm-list and TLS checks. */
export declare function LocalEdgeCore_doctorFormatRegistrySummaryLine(summary: LocalEdgeCore_DoctorRegistrySummary): string;
/**
 * Reads `runAt`, `realms`, and `generatedFiles` from a render artifact with legacy nullish rules.
 */
export declare function LocalEdgeCore_doctorSummarizeRenderArtifactPayload(payload: unknown): LocalEdgeCore_DoctorRenderArtifactSummary;
/** Formats the single render-artifact freshness line for stdout. */
export declare function LocalEdgeCore_doctorFormatRenderArtifactLine(summary: LocalEdgeCore_DoctorRenderArtifactSummary): string;
/** Builds `*.realm.method.developer.rootZone` wildcards for active realms. */
export declare function LocalEdgeCore_doctorCollectActiveRealmTlsWildcards(payload: unknown): string[];
/** Formats the missing-registry error line shared by CLI adapters and legacy wrappers. */
export declare function LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine(registryPath: string): string;
/** Confirms a workspace has a matching realm row in an already parsed registry payload. */
export declare function LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload(options: LocalEdgeCore_DoctorVerifyWorkspaceRegistrationPayloadOptions): LocalEdgeCore_DoctorVerifyWorkspaceRegistrationResult;
/** Confirms a workspace has a matching realm row in the registry file. */
export declare function LocalEdgeCore_doctorVerifyWorkspaceRegistration(options: LocalEdgeCore_DoctorVerifyWorkspaceRegistrationOptions): LocalEdgeCore_DoctorVerifyWorkspaceRegistrationResult;
//# sourceMappingURL=doctor.d.ts.map