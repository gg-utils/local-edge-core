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
import fs from "node:fs";
/** Stable prefix for every doctor log line consumed by operators and tests. */
export const LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX = "[local-edge:doctor]";
/** Argv/usage failures from doctor compatibility CLI surfaces. */
export class LocalEdgeCoreDoctorError extends Error {
    /**
     * Builds a named error for argv parsing and other doctor-core CLI contract violations.
     *
     * @param message - Human-readable reason printed after the doctor log prefix.
     */
    constructor(message) {
        super(message);
        this.name = "LocalEdgeCoreDoctorError";
    }
}
/** Narrows unknown JSON values to a non-null object record for field reads. */
function LocalEdgeCore_doctorIsRecord(value) {
    return typeof value === "object" && value !== null;
}
/**
 * Extracts `realms` rows using `Object.values`, including array-backed realm containers.
 *
 * @remarks
 * This intentionally stays loose to preserve legacy doctor behavior for partially written or older
 * registry payloads.
 */
export function LocalEdgeCore_doctorRealmValuesFromPayload(payload) {
    if (!LocalEdgeCore_doctorIsRecord(payload)) {
        return [];
    }
    const realmsRaw = payload.realms;
    if (!LocalEdgeCore_doctorIsRecord(realmsRaw)) {
        return [];
    }
    return Object.values(realmsRaw);
}
/**
 * Parses registry/render JSON text for downstream loose summarization.
 *
 * @throws {SyntaxError} When `jsonText` is not valid JSON.
 * @throws {LocalEdgeCoreDoctorError} When the parsed JSON root is not an object.
 */
export function LocalEdgeCore_doctorParseJsonText(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!LocalEdgeCore_doctorIsRecord(parsed)) {
        throw new LocalEdgeCoreDoctorError("Registry JSON must be an object");
    }
    return parsed;
}
/** Renders product-neutral doctor-core subcommand help without writing to stdout. */
export function LocalEdgeCore_doctorRenderUsage() {
    return `Usage: doctor-core.ts <command> [options]

Commands:
  print-registry-line --path <registry.json>
  verify-root-workspace --registry <registry.json> --workspace <dir> --realm <slug>
  print-render-line --path <render-last-run.json>
  print-tls-wildcards --path <registry.json>
`;
}
/**
 * Maps raw argv after the script path into the generic doctor command envelope.
 *
 * @throws {LocalEdgeCoreDoctorError} When a command is unknown or a required flag is missing.
 */
export function LocalEdgeCore_doctorParseArgv(argv) {
    const [command, ...rest] = argv;
    if (!command || command === "--help" || command === "-h") {
        return { command: "help" };
    }
    /** Reads the token immediately after `flag` from the remaining argv tail. */
    const readFlagValue = (flag) => {
        const index = rest.indexOf(flag);
        if (index === -1 || index + 1 >= rest.length) {
            throw new LocalEdgeCoreDoctorError(`Missing value for ${flag}`);
        }
        return rest[index + 1] ?? "";
    };
    if (command === "print-registry-line") {
        return {
            command: "print-registry-line",
            registryPath: readFlagValue("--path"),
        };
    }
    if (command === "verify-root-workspace") {
        return {
            command: "verify-root-workspace",
            registryPath: readFlagValue("--registry"),
            workspacePath: readFlagValue("--workspace"),
            realmSlug: readFlagValue("--realm"),
        };
    }
    if (command === "print-render-line") {
        return {
            command: "print-render-line",
            artifactPath: readFlagValue("--path"),
        };
    }
    if (command === "print-tls-wildcards") {
        return {
            command: "print-tls-wildcards",
            registryPath: readFlagValue("--path"),
        };
    }
    throw new LocalEdgeCoreDoctorError(`Unknown command: ${command}`);
}
/** Counts realm rows by status for the doctor registry line. */
export function LocalEdgeCore_doctorSummarizeRegistryPayload(payload) {
    const realmValues = LocalEdgeCore_doctorRealmValuesFromPayload(payload);
    let active = 0;
    let inactive = 0;
    let stale = 0;
    for (const realm of realmValues) {
        if (!LocalEdgeCore_doctorIsRecord(realm)) {
            continue;
        }
        if (realm.status === "active") {
            active += 1;
        }
        else if (realm.status === "inactive") {
            inactive += 1;
        }
        else if (realm.status === "stale") {
            stale += 1;
        }
    }
    const schemaVersionRaw = LocalEdgeCore_doctorIsRecord(payload)
        ? payload.schemaVersion
        : undefined;
    return {
        schemaVersionDisplay: String(schemaVersionRaw),
        realmCount: realmValues.length,
        active,
        inactive,
        stale,
    };
}
/** Formats the registry integrity line emitted before realm-list and TLS checks. */
export function LocalEdgeCore_doctorFormatRegistrySummaryLine(summary) {
    return `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Registry schema=${summary.schemaVersionDisplay} realms=${summary.realmCount} active=${summary.active} inactive=${summary.inactive} stale=${summary.stale}`;
}
/**
 * Reads `runAt`, `realms`, and `generatedFiles` from a render artifact with legacy nullish rules.
 */
export function LocalEdgeCore_doctorSummarizeRenderArtifactPayload(payload) {
    const isRecord = LocalEdgeCore_doctorIsRecord(payload);
    const runAtRaw = isRecord ? payload.runAt : undefined;
    const realmsRaw = isRecord ? payload.realms : undefined;
    const generatedRaw = isRecord ? payload.generatedFiles : undefined;
    return {
        runAtDisplay: String(runAtRaw ?? "unknown"),
        realmsJoined: Array.isArray(realmsRaw) ? realmsRaw.join(",") : "",
        generatedFileCount: Array.isArray(generatedRaw) ? generatedRaw.length : 0,
    };
}
/** Formats the single render-artifact freshness line for stdout. */
export function LocalEdgeCore_doctorFormatRenderArtifactLine(summary) {
    const realms = summary.realmsJoined.length > 0 ? summary.realmsJoined : "none";
    return `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Render artifact runAt=${summary.runAtDisplay} realms=${realms} generatedFiles=${summary.generatedFileCount}`;
}
/** Builds `*.realm.method.developer.rootZone` wildcards for active realms. */
export function LocalEdgeCore_doctorCollectActiveRealmTlsWildcards(payload) {
    const realmValues = LocalEdgeCore_doctorRealmValuesFromPayload(payload);
    const wildcards = [];
    for (const realm of realmValues) {
        if (!LocalEdgeCore_doctorIsRecord(realm) || realm.status !== "active") {
            continue;
        }
        const slug = realm.realmSlug;
        const method = realm.primaryMethod;
        const developer = realm.developerSlug;
        const rootZone = realm.rootZone;
        if (typeof slug !== "string" ||
            typeof method !== "string" ||
            typeof developer !== "string" ||
            typeof rootZone !== "string" ||
            slug.length === 0 ||
            method.length === 0 ||
            developer.length === 0 ||
            rootZone.length === 0) {
            continue;
        }
        wildcards.push(`*.${slug}.${method}.${developer}.${rootZone}`);
    }
    return wildcards;
}
/** Formats the missing-registry error line shared by CLI adapters and legacy wrappers. */
export function LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine(registryPath) {
    return `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} ERROR: Local session is active but registry is missing: ${registryPath}`;
}
/** Confirms a workspace has a matching realm row in an already parsed registry payload. */
export function LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload(options) {
    const realmValues = LocalEdgeCore_doctorRealmValuesFromPayload(options.payload);
    const matched = realmValues.some((realm) => LocalEdgeCore_doctorIsRecord(realm) &&
        realm.workspacePath === options.workspacePath &&
        realm.realmSlug === options.expectedRealmSlug);
    if (!matched) {
        return {
            ok: false,
            kind: "not_registered",
            exitCode: 1,
            stderrLine: `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} ERROR: Active local session is missing root-workspace realm registration for workspace=${options.workspacePath} realm=${options.expectedRealmSlug}.`,
        };
    }
    return {
        ok: true,
        line: `${LOCAL_EDGE_CORE_DOCTOR_LOG_PREFIX} Root-workspace realm registration confirmed for realm=${options.expectedRealmSlug}.`,
    };
}
/** Confirms a workspace has a matching realm row in the registry file. */
export function LocalEdgeCore_doctorVerifyWorkspaceRegistration(options) {
    if (!fs.existsSync(options.registryPath)) {
        return {
            ok: false,
            kind: "registry_missing",
            exitCode: 1,
            stderrLine: LocalEdgeCore_doctorFormatMissingWorkspaceRegistryLine(options.registryPath),
        };
    }
    const rawText = fs.readFileSync(options.registryPath, "utf8");
    const payload = LocalEdgeCore_doctorParseJsonText(rawText);
    return LocalEdgeCore_doctorVerifyWorkspaceRegistrationPayload({
        ...options,
        payload,
    });
}
//# sourceMappingURL=doctor.js.map