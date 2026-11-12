/**
 * @fileoverview Exposure backend registry: picks a backend by name so the choice is config, not code.
 *
 * `tailscale-serve-ports` (config alias `ports`) is the default because it needs no admin.
 * `hostnames` and `tailscale-services` are plan-only backends whose `apply()` refuses.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-plan-only.unit.test.ts
 *
 * @see src/exposure-tailscale-serve.ts - Default backend.
 * @see src/exposure-plan-only.ts - Plan-only backends.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { LocalEdgeCore_ExposureBackend, LocalEdgeCore_ExposureCommandRunner } from "./exposure.js";
import {
  type LocalEdgeCore_HostnamesBackendOptions,
  LOCAL_EDGE_CORE_HOSTNAMES_BACKEND,
  LocalEdgeCore_createHostnamesBackend,
} from "./exposure-hostnames.js";
import {
  LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
  LocalEdgeCore_createTailscaleServicesBackend,
} from "./exposure-plan-only.js";
import {
  LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
  LocalEdgeCore_createTailscaleServePortsBackend,
} from "./exposure-tailscale-serve.js";

/** Backend names known to the registry, default first. */
export const LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES = [
  LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
  LOCAL_EDGE_CORE_HOSTNAMES_BACKEND,
  LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
] as const;

/**
 * Short config names. `ports` and `hostnames` are what a config sets as `backend`;
 * `wildcard-dns-nginx` is kept as an alias of `hostnames`.
 */
export const LOCAL_EDGE_CORE_EXPOSURE_BACKEND_ALIASES: Readonly<Record<string, LocalEdgeCore_ExposureBackendName>> = {
  ports: LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
  "wildcard-dns-nginx": LOCAL_EDGE_CORE_HOSTNAMES_BACKEND,
};

/**
 * Resolves an alias to its backend name; returns the input when it is not an alias.
 *
 * @param name - Name from config.
 * @returns The registered name for an alias (`ports`, `wildcard-dns-nginx`), otherwise `name` unchanged.
 * @example
 * ```typescript
 * LocalEdgeCore_resolveExposureBackendName("ports"); // "tailscale-serve-ports"
 * ```
 */
export function LocalEdgeCore_resolveExposureBackendName(name: string): string {
  return LOCAL_EDGE_CORE_EXPOSURE_BACKEND_ALIASES[name] ?? name;
}

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
  return (LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES as readonly string[]).includes(
    LocalEdgeCore_resolveExposureBackendName(name),
  );
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
  } & LocalEdgeCore_HostnamesBackendOptions = {},
): LocalEdgeCore_ExposureBackend {
  switch (LocalEdgeCore_resolveExposureBackendName(name)) {
    case LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND:
      return LocalEdgeCore_createTailscaleServePortsBackend(options);
    case LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND:
      return LocalEdgeCore_createTailscaleServicesBackend(options);
    case LOCAL_EDGE_CORE_HOSTNAMES_BACKEND:
      return LocalEdgeCore_createHostnamesBackend(options);
    default:
      throw new Error(
        `unknown exposure backend "${name}"; known: ${[...LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES, ...Object.keys(LOCAL_EDGE_CORE_EXPOSURE_BACKEND_ALIASES)].join(", ")}`,
      );
  }
}

/* The `./exposure` subpath is the one import consumers need: contract, backends and registry. */
export * from "./exposure.js";
export * from "./exposure-hostnames.js";
export * from "./exposure-plan-only.js";
export * from "./exposure-tailscale-serve.js";
