/**
 * @fileoverview `hostnames` exposure backend: one host per app, shaped
 * `<app>.<realm>.<method>.<machine>.<rootZone>`, routed by SNI on one loopback router port.
 *
 * Plan-only. Every step needs someone else first (the DNS owner for the zone, a certificate for
 * the realm wildcard, the tailnet admin for split DNS), so `plan()` prints the full set of steps
 * and `apply()` always refuses. Nothing here starts nginx or dnsmasq, writes resolver files, or
 * issues certificates. Rendering reuses core helpers: hostnames from `hostname.ts`, nginx server
 * blocks from `nginx.ts`, the dnsmasq rule and macOS resolver text from `dns.ts`, and the mkcert
 * command from `tls.ts`.
 * Flow: manifest + hostnames settings -> per-app server blocks -> router DNS, TLS and tailnet steps.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-hostnames.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract and the hostnames settings type.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { type LocalEdgeCore_ExposureAction, type LocalEdgeCore_ExposureBackend, type LocalEdgeCore_ExposureHostnamesConfig, type LocalEdgeCore_ExposureManifest } from "./exposure.js";
/** Backend name for SNI-routed hostnames. */
export declare const LOCAL_EDGE_CORE_HOSTNAMES_BACKEND = "hostnames";
/** Validates hostname settings. Returns problems; empty means valid. */
export declare function LocalEdgeCore_validateExposureHostnames(manifest: LocalEdgeCore_ExposureManifest): string[];
/** Builds `<app>.<realm>.<method>.<machine>.<rootZone>`. */
export declare function LocalEdgeCore_buildExposureHostname(settings: LocalEdgeCore_ExposureHostnamesConfig, surface: string): string;
/** Wildcard covering every app host of one realm, for example `*.main.nginx.m3.example.internal`. */
export declare function LocalEdgeCore_buildExposureRealmWildcard(settings: LocalEdgeCore_ExposureHostnamesConfig): string;
/** Certificate and key paths the plan uses for the realm. */
export declare function LocalEdgeCore_resolveExposureHostnamesTlsPaths(settings: LocalEdgeCore_ExposureHostnamesConfig): {
    certPath: string;
    keyPath: string;
};
/** Builds every planned action for the hostname backend. Pure. */
export declare function LocalEdgeCore_planExposureHostnames(manifest: LocalEdgeCore_ExposureManifest, options?: {
    tailscaleBin?: string | undefined;
}): LocalEdgeCore_ExposureAction[];
/** Creates the plan-only `hostnames` backend. `apply()` and `remove()` always refuse. */
export declare function LocalEdgeCore_createHostnamesBackend(options?: {
    tailscaleBin?: string | undefined;
}): LocalEdgeCore_ExposureBackend;
