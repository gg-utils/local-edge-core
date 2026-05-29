/**
 * @fileoverview Barrel module that re-exports product-neutral DNS, TLS, network, and Docker
 * lifecycle helpers for host-mutation planning under the `@gg-utils/local-edge-core/host-mutations` subpath.
 *
 * This file owns only the stable aggregate import surface; implementation lives in the sibling
 * modules re-exported below. Callers still own prompts, privilege escalation, subprocess execution,
 * and any project-specific host-state policy.
 *
 * @example
 * ```typescript
 * import { LocalEdgeCore_renderDnsmasqConfig } from "@gg-utils/local-edge-core/host-mutations";
 * ```
 *
 * @testing Node test: npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/dns.ts - dnsmasq and hosts-oriented helpers forming the DNS slice re-exported through this barrel.
 * @see packages/local-edge-core/src/tls.ts - Certificate and trust-planning helpers re-exported so host mutation flows can combine TLS with DNS and network work.
 * @see packages/local-edge-core/src/network.ts - Loopback alias and listener helpers re-exported for network-side mutation planning alongside DNS and TLS.
 * @see packages/local-edge-core/src/docker-lifecycle.ts - Compose and nginx reload sequencing helpers forming the Docker lifecycle slice aggregated here.
 * @see packages/local-edge-core/src/package-exports.unit.test.ts - Node test module that imports `@gg-utils/local-edge-core/host-mutations` to guard the Level A subpath export surface.
 * @see packages/local-edge-core/README.md - Package README that lists the host-mutations subpath among narrow adapter-facing exports.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
export * from "./dns.js";
export * from "./tls.js";
export * from "./network.js";
export * from "./docker-lifecycle.js";
//# sourceMappingURL=host-mutations.js.map