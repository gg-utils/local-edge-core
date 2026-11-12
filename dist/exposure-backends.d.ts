/**
 * @fileoverview Exposure backend registry: picks a backend by name so the choice is config, not code.
 *
 * `tailscale-serve-ports` is the default because it needs no admin. The other names build
 * plan-only backends whose `apply()` refuses.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-plan-only.unit.test.ts
 *
 * @see src/exposure-tailscale-serve.ts - Default backend.
 * @see src/exposure-plan-only.ts - Plan-only backends.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import type { LocalEdgeCore_ExposureBackend, LocalEdgeCore_ExposureCommandRunner } from "./exposure.js";
/** Backend names known to the registry, default first. */
export declare const LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES: readonly ["tailscale-serve-ports", "tailscale-services", "wildcard-dns-nginx"];
/** One of the registered backend names. */
export type LocalEdgeCore_ExposureBackendName = (typeof LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES)[number];
/** Default backend name. */
export declare const LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND: LocalEdgeCore_ExposureBackendName;
/** True when `name` is a registered backend name. */
export declare function LocalEdgeCore_isExposureBackendName(name: string): name is LocalEdgeCore_ExposureBackendName;
/** Creates a backend by name. Throws for an unknown name so a typo never falls back silently. */
export declare function LocalEdgeCore_createExposureBackend(name: string, options?: {
    runner?: LocalEdgeCore_ExposureCommandRunner | undefined;
    tailscaleBin?: string | undefined;
}): LocalEdgeCore_ExposureBackend;
export * from "./exposure.js";
export * from "./exposure-plan-only.js";
export * from "./exposure-tailscale-serve.js";
