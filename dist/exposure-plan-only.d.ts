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
/**
 * Creates the plan-only `tailscale-services` backend (`svc:<name>` per app).
 *
 * @param options - CLI binary used in the suggested commands.
 * @returns A backend whose plans hold one `manual` action per enabled app needing a tailnet admin,
 *   and whose `apply`/`remove` always refuse without running anything.
 *
 * @example
 * ```typescript
 * const plan = LocalEdgeCore_createTailscaleServicesBackend().plan(manifest);
 * plan.applicable; // false: the admin runs the steps
 * ```
 */
export declare function LocalEdgeCore_createTailscaleServicesBackend(options?: {
    tailscaleBin?: string | undefined;
}): LocalEdgeCore_ExposureBackend;
/**
 * Creates the plan-only `wildcard-dns-nginx` backend (`<name>.<rootZone>` per app).
 *
 * @returns A backend whose plans render one nginx server block per enabled app as `detail`, only
 *   after the effective name is a single DNS label and `<name>.<rootZone>` a valid DNS name of at
 *   most 253 characters (otherwise the app is `refuse` and nothing is rendered); `apply`/`remove`
 *   always refuse.
 *
 * @example
 * ```typescript
 * const plan = LocalEdgeCore_createWildcardDnsNginxBackend().plan({ ...manifest, rootZone: "dev.example.test" });
 * console.log(plan.actions[0]?.detail); // server block for <app>.dev.example.test
 * ```
 */
export declare function LocalEdgeCore_createWildcardDnsNginxBackend(): LocalEdgeCore_ExposureBackend;
