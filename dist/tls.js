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
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalEdgeCore_commandExists } from "./system.js";
/** Default host filesystem operations for live TLS generation. */
const LocalEdgeCore_defaultTlsFileSystem = {
    /** Returns whether the requested path exists on the host filesystem. */
    fileExists(filePath) {
        return fsSync.existsSync(filePath);
    },
    /** Creates the requested directory and any missing parents. */
    async ensureDirectory(directoryPath) {
        await fs.mkdir(directoryPath, { recursive: true });
    },
};
/** Runs a generator command with captured stdio so errors can be rethrown with adapter context. */
const LocalEdgeCore_defaultTlsCommandRunner = (command, args) => {
    execFileSync(command, [...args], { stdio: "pipe" });
};
/** Converts `spawnSync` stdout buffers/strings into text for probe helpers. */
function LocalEdgeCore_spawnProbeCommand(command, args, timeoutMs) {
    const result = spawnSync(command, [...args], {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: timeoutMs,
    });
    const stdout = typeof result.stdout === "string"
        ? result.stdout
        : result.stdout?.toString("utf-8") ?? null;
    return {
        status: result.status,
        stdout,
    };
}
/** Default host probe dependencies for live mkcert and Tailscale detection. */
const LocalEdgeCore_defaultTlsProbeDependencies = {
    commandExists: LocalEdgeCore_commandExists,
    fileExists: fsSync.existsSync,
    homeDir: os.homedir(),
    runCommand: LocalEdgeCore_spawnProbeCommand,
};
/** Resolves optional test doubles to the default live host dependencies. */
function LocalEdgeCore_resolveTlsDependencies(dependencies) {
    return (dependencies ?? {
        fileSystem: LocalEdgeCore_defaultTlsFileSystem,
        runCommand: LocalEdgeCore_defaultTlsCommandRunner,
    });
}
/** Formats an unknown caught error without using unsafe assertions. */
function LocalEdgeCore_errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Narrows parsed JSON to a record so probe helpers can inspect optional fields safely. */
function LocalEdgeCore_isRecord(value) {
    return typeof value === "object" && value !== null;
}
/** Normalizes non-empty suffix strings to the lower-case form used by the legacy helpers. */
function LocalEdgeCore_normalizeTailnetSuffix(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}
/** Ensures both certificate and key parent directories exist. */
async function LocalEdgeCore_ensureTlsParentDirectories(options) {
    const certDirectory = path.dirname(options.certPath);
    const keyDirectory = path.dirname(options.keyPath);
    if (!options.fileSystem.fileExists(certDirectory)) {
        await options.fileSystem.ensureDirectory(certDirectory);
    }
    if (!options.fileSystem.fileExists(keyDirectory)) {
        await options.fileSystem.ensureDirectory(keyDirectory);
    }
}
/** Verifies a generator command produced both expected output files. */
function LocalEdgeCore_assertTlsFilesExist(options) {
    if (!options.fileSystem.fileExists(options.certPath) ||
        !options.fileSystem.fileExists(options.keyPath)) {
        throw new Error(options.message);
    }
}
/** Generates or reuses mkcert TLS material for the given hostname list and output paths. */
async function LocalEdgeCore_generateMkcertCert(options) {
    const warnings = [];
    const hasCert = options.dependencies.fileSystem.fileExists(options.certPath);
    const hasKey = options.dependencies.fileSystem.fileExists(options.keyPath);
    if (hasCert && hasKey && !options.forceRegenerate && options.reuseExisting) {
        return warnings;
    }
    await LocalEdgeCore_ensureTlsParentDirectories({
        fileSystem: options.dependencies.fileSystem,
        certPath: options.certPath,
        keyPath: options.keyPath,
    });
    try {
        options.dependencies.runCommand("mkcert", [
            "-cert-file",
            options.certPath,
            "-key-file",
            options.keyPath,
            ...options.hostnames,
        ]);
    }
    catch (error) {
        throw new Error(`${options.messagePrefix} Failed to generate mkcert TLS files: ${LocalEdgeCore_errorMessage(error)}. Run 'mkcert -install' once and retry.`);
    }
    LocalEdgeCore_assertTlsFilesExist({
        fileSystem: options.dependencies.fileSystem,
        certPath: options.certPath,
        keyPath: options.keyPath,
        message: `${options.messagePrefix} mkcert TLS generation reported success but files are missing.`,
    });
    warnings.push(`Generated mkcert TLS files: cert='${options.certPath}', ` +
        `key='${options.keyPath}', hosts=${options.hostnames.length}.`);
    return warnings;
}
/** Generates or reuses a short-lived self-signed RSA certificate. */
async function LocalEdgeCore_generateSelfSignedCert(options) {
    const warnings = [];
    const hasCert = options.dependencies.fileSystem.fileExists(options.certPath);
    const hasKey = options.dependencies.fileSystem.fileExists(options.keyPath);
    if (hasCert && hasKey) {
        return warnings;
    }
    await LocalEdgeCore_ensureTlsParentDirectories({
        fileSystem: options.dependencies.fileSystem,
        certPath: options.certPath,
        keyPath: options.keyPath,
    });
    try {
        options.dependencies.runCommand("openssl", [
            "req",
            "-x509",
            "-nodes",
            "-newkey",
            "rsa:2048",
            "-keyout",
            options.keyPath,
            "-out",
            options.certPath,
            "-days",
            "30",
            "-subj",
            `/CN=${options.hostnames[0] ?? "local-edge"}`,
            "-addext",
            "subjectAltName=" +
                options.hostnames.map((hostname) => "DNS:" + hostname).join(","),
        ]);
    }
    catch (error) {
        throw new Error(`${options.messagePrefix} Failed to generate self-signed TLS files via openssl: ` +
            LocalEdgeCore_errorMessage(error));
    }
    LocalEdgeCore_assertTlsFilesExist({
        fileSystem: options.dependencies.fileSystem,
        certPath: options.certPath,
        keyPath: options.keyPath,
        message: `${options.messagePrefix} TLS generation reported success but files are missing.`,
    });
    warnings.push(`Generated self-signed TLS files: cert='${options.certPath}', ` +
        `key='${options.keyPath}'`);
    return warnings;
}
/** Ensures TLS certificate and key files exist according to the configured TLS mode. */
export async function LocalEdgeCore_ensureTlsFiles(options) {
    const dependencies = LocalEdgeCore_resolveTlsDependencies(options.dependencies);
    if (options.mode === "provided") {
        if (!dependencies.fileSystem.fileExists(options.certPath) ||
            !dependencies.fileSystem.fileExists(options.keyPath)) {
            throw new Error(`${options.messagePrefix} LOCAL_EDGE_TLS_MODE=provided requires existing files: ` +
                `cert='${options.certPath}', key='${options.keyPath}'.`);
        }
        return [];
    }
    if (options.mode === "mkcert") {
        return LocalEdgeCore_generateMkcertCert({
            certPath: options.certPath,
            keyPath: options.keyPath,
            hostnames: options.hostnames,
            forceRegenerate: options.forceRegenerate,
            reuseExisting: options.reuseExisting,
            messagePrefix: options.messagePrefix,
            dependencies,
        });
    }
    return LocalEdgeCore_generateSelfSignedCert({
        certPath: options.certPath,
        keyPath: options.keyPath,
        hostnames: options.hostnames,
        messagePrefix: options.messagePrefix,
        dependencies,
    });
}
/**
 * Returns true when mkcert's root CA exists and appears trusted by the host certificate store.
 *
 * @remarks
 * This mirrors the legacy local-edge helper without knowing any adapter-specific hostname catalog.
 */
export function LocalEdgeCore_mkcertTrustDetected(dependencies = LocalEdgeCore_defaultTlsProbeDependencies) {
    if (!dependencies.commandExists("mkcert")) {
        return false;
    }
    const caRootResult = dependencies.runCommand("mkcert", ["-CAROOT"], 5000);
    if (caRootResult.status !== 0 || caRootResult.stdout === null) {
        return false;
    }
    const caRoot = caRootResult.stdout.trim();
    if (caRoot.length === 0) {
        return false;
    }
    const rootCaPem = path.join(caRoot, "rootCA.pem");
    if (!dependencies.fileExists(rootCaPem)) {
        return false;
    }
    if (!dependencies.commandExists("security")) {
        const userCaPath = path.join(dependencies.homeDir, ".local", "share", "mkcert", "rootCA.pem");
        return dependencies.fileExists(userCaPath);
    }
    const systemKeychain = "/Library/Keychains/System.keychain";
    const systemResult = dependencies.runCommand("security", ["find-certificate", "-a", "-c", "mkcert development CA", systemKeychain], 5000);
    if (systemResult.status === 0) {
        return true;
    }
    if (dependencies.homeDir.length > 0) {
        const loginKeychain = path.join(dependencies.homeDir, "Library", "Keychains", "login.keychain-db");
        const loginResult = dependencies.runCommand("security", ["find-certificate", "-a", "-c", "mkcert development CA", loginKeychain], 5000);
        if (loginResult.status === 0) {
            return true;
        }
    }
    return false;
}
/**
 * Detects the current Tailscale MagicDNS suffix from `tailscale status --json`.
 *
 * @remarks
 * `CurrentTailnet.MagicDNSSuffix` wins over the legacy top-level `MagicDNSSuffix` field.
 */
export function LocalEdgeCore_detectTailnetSuffix(dependencies = LocalEdgeCore_defaultTlsProbeDependencies) {
    if (!dependencies.commandExists("tailscale")) {
        return null;
    }
    const result = dependencies.runCommand("tailscale", ["status", "--json"], 10_000);
    if (result.status !== 0 || result.stdout === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(result.stdout);
        if (!LocalEdgeCore_isRecord(parsed)) {
            return null;
        }
        const currentTailnet = parsed.CurrentTailnet;
        const currentSuffix = LocalEdgeCore_isRecord(currentTailnet)
            ? LocalEdgeCore_normalizeTailnetSuffix(currentTailnet.MagicDNSSuffix)
            : null;
        if (currentSuffix !== null) {
            return currentSuffix;
        }
        return LocalEdgeCore_normalizeTailnetSuffix(parsed.MagicDNSSuffix);
    }
    catch {
        return null;
    }
}
/** Resolves a configured, auto-detected, or default Tailscale MagicDNS suffix. */
export function LocalEdgeCore_resolveTailnetSuffix(configuredValue, dependencies = LocalEdgeCore_defaultTlsProbeDependencies) {
    const normalized = configuredValue.trim().toLowerCase();
    if (normalized.length > 0 && normalized !== "auto") {
        return normalized;
    }
    const detected = LocalEdgeCore_detectTailnetSuffix(dependencies);
    if (detected !== null) {
        return detected;
    }
    return "gannet-frog.ts.net";
}
//# sourceMappingURL=tls.js.map