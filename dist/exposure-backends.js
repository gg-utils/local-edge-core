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
import { LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND, LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND, LocalEdgeCore_createTailscaleServicesBackend, LocalEdgeCore_createWildcardDnsNginxBackend, } from "./exposure-plan-only.js";
import { LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND, LocalEdgeCore_createTailscaleServePortsBackend, } from "./exposure-tailscale-serve.js";
/** Backend names known to the registry, default first. */
export const LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES = [
    LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND,
    LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
    LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND,
];
/** Default backend name. */
export const LOCAL_EDGE_CORE_DEFAULT_EXPOSURE_BACKEND = LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND;
/** True when `name` is a registered backend name. */
export function LocalEdgeCore_isExposureBackendName(name) {
    return LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES.includes(name);
}
/** Creates a backend by name. Throws for an unknown name so a typo never falls back silently. */
export function LocalEdgeCore_createExposureBackend(name, options = {}) {
    switch (name) {
        case LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND:
            return LocalEdgeCore_createTailscaleServePortsBackend(options);
        case LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND:
            return LocalEdgeCore_createTailscaleServicesBackend(options);
        case LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND:
            return LocalEdgeCore_createWildcardDnsNginxBackend();
        default:
            throw new Error(`unknown exposure backend "${name}"; known: ${LOCAL_EDGE_CORE_EXPOSURE_BACKEND_NAMES.join(", ")}`);
    }
}
/* The `./exposure` subpath is the one import consumers need: contract, backends and registry. */
export * from "./exposure.js";
export * from "./exposure-plan-only.js";
export * from "./exposure-tailscale-serve.js";
