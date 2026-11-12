/**
 * @fileoverview Plan-only exposure backends: `tailscale-services` (one `svc:<name>` per app) and
 * `wildcard-dns-nginx` (one `<name>.<zone>` host per app behind a local nginx router).
 *
 * Both need someone else first: tailnet services need a tailnet admin to define and approve the
 * service, and the wildcard route needs the DNS and TLS owner. So `plan()` prints the steps,
 * every action is marked `manual` with what it needs, and `apply()` always refuses.
 * Flow: manifest -> manual actions with suggested commands or config text -> owner acts by hand.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-plan-only.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract.
 * @see src/nginx.ts - Server-block renderer reused for the wildcard plan text.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { type LocalEdgeCore_ExposureBackend } from "./exposure.js";
/** Backend name for tailnet services. */
export declare const LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND = "tailscale-services";
/** Backend name for wildcard DNS plus nginx. */
export declare const LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND = "wildcard-dns-nginx";
/** Creates the plan-only `tailscale-services` backend (`svc:<name>` per app). */
export declare function LocalEdgeCore_createTailscaleServicesBackend(options?: {
    tailscaleBin?: string | undefined;
}): LocalEdgeCore_ExposureBackend;
/** Creates the plan-only `wildcard-dns-nginx` backend (`<name>.<rootZone>` per app). */
export declare function LocalEdgeCore_createWildcardDnsNginxBackend(): LocalEdgeCore_ExposureBackend;
