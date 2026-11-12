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
import {
  LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
  LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND,
  LocalEdgeCore_createTailscaleServicesBackend,
  LocalEdgeCore_createWildcardDnsNginxBackend,
} from "./exposure-plan-only.js";
import {
  LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
  LocalEdgeCore_createTailscaleServePortsBackend,
} from "./exposure-tailscale-serve.js";

/** Backend names known to the registry, default first. */
export const LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES = [
  LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
  LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
  LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND,
] as const;

/** One of the registered backend names. */
export type LocalEdgeCore_ExposureBackendName = (typeof LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES)[number];

/** Default backend name. */
export const LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND: LocalEdgeCore_ExposureBackendName =
  LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND;

/**
 * True when `name` is a registered backend name.
 *
 * @param name - Candidate name, for example from config.
 * @returns Whether it is one of `LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_isExposureBackendName("tailscale-serve-ports"); // true
 * ```
 */
export function LocalEdgeCore_isExposureBackendName(
  name: string,
): name is LocalEdgeCore_ExposureBackendName {
  return (LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES as readonly string[]).includes(name);
}

/**
 * Creates a backend by name. Throws for an unknown name so a typo never falls back silently.
 *
 * @param name - Registered backend name.
 * @param options - Runner and CLI binary, passed to the backends that use them.
 * @returns The new backend instance.
 * @throws For an unknown name, listing the known names.
 *
 * @example
 * ```typescript
 * const backend = LocalEdgeCore_createExposureBackend(config.backend ?? LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND);
 * ```
 */
export function LocalEdgeCore_createExposureBackend(
  name: string,
  options: {
    runner?: LocalEdgeCore_ExposureCommandRunner | undefined;
    tailscaleBin?: string | undefined;
  } = {},
): LocalEdgeCore_ExposureBackend {
  switch (name) {
    case LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND:
      return LocalEdgeCore_createTailscaleServePortsBackend(options);
    case LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND:
      return LocalEdgeCore_createTailscaleServicesBackend(options);
    case LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND:
      return LocalEdgeCore_createWildcardDnsNginxBackend();
    default:
      throw new Error(
        `unknown exposure backend "${name}"; known: ${LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES.join(", ")}`,
      );
  }
}

/* The `./exposure` subpath is the one import consumers need: contract, backends and registry. */
export * from "./exposure.js";
export * from "./exposure-plan-only.js";
export * from "./exposure-tailscale-serve.js";
