/**
 * @fileoverview Plan-only `tailscale-services` exposure backend: one `svc:<name>` per app.
 *
 * Tailnet services need a tailnet admin to define and approve each service, so `plan()` prints
 * the steps, every action is marked `manual` with what it needs, and `apply()` always refuses.
 * The SNI hostname backend lives in `exposure-hostnames.ts`.
 * Flow: manifest -> manual actions with suggested commands or config text -> owner acts by hand.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-plan-only.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { type LocalEdgeCore_ExposureBackend } from "./exposure.js";
/** Backend name for tailnet services. */
export declare const LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND = "tailscale-services";
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
