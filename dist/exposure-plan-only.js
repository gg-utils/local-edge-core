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
import { LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
/** Backend name for tailnet services. */
export const LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND = "tailscale-services";
function LocalEdgeCore_createPlanOnlyBackend(options) {
    const build = (manifest, builder) => {
        const problems = LocalEdgeCore_validateExposureManifest(manifest);
        const actions = manifest.apps.map((app) => {
            const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
            const base = { appId: app.id, requires: options.requires, target };
            if (!app.enabled) {
                return { ...base, kind: "skip", requires: "none", reason: "app is disabled" };
            }
            if (problems.length > 0) {
                return { ...base, kind: "refuse", reason: `manifest invalid: ${problems.join("; ")}` };
            }
            const name = app.edgeName ?? app.id;
            return {
                ...base,
                kind: "manual",
                ...builder({ appId: app.id, name, localPort: app.localPort, manifest }),
            };
        });
        return LocalEdgeCore_buildExposurePlan({
            backend: options.name,
            hostname: manifest.hostname ?? null,
            actions,
        });
    };
    const refuse = (dryRun) => LocalEdgeCore_refusedExposureApply({
        backend: options.name,
        dryRun,
        message: `${options.name} is plan-only: it needs ${options.requires}; run the planned steps by hand`,
    });
    return {
        name: options.name,
        requires: options.requires,
        plan: (manifest) => build(manifest, options.buildExpose),
        planRemove: (manifest) => build(manifest, options.buildRemove),
        apply: (_plan, applyOptions) => refuse(applyOptions?.apply !== true),
        remove: (_manifest, removeOptions) => refuse(removeOptions?.apply !== true),
        status: (manifest) => manifest.apps.map((app) => ({
            appId: app.id,
            state: app.enabled ? "unknown" : "disabled",
            edgeUrl: null,
            target: LocalEdgeCore_exposureTargetUrl(app.localPort),
            observedTarget: null,
            note: `${options.name} is plan-only; status is not observed`,
        })),
    };
}
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
export function LocalEdgeCore_createTailscaleServicesBackend(options = {}) {
    const bin = options.tailscaleBin ?? "tailscale";
    return LocalEdgeCore_createPlanOnlyBackend({
        name: LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND,
        requires: "tailnet-admin",
        buildExpose: ({ name, localPort }) => ({
            reason: `tailnet admin must define svc:${name}, allow this node to host it, and approve it`,
            argv: [bin, "serve", `--service=svc:${name}`, "--https=443", LocalEdgeCore_exposureTargetUrl(localPort)],
        }),
        buildRemove: ({ name }) => ({
            reason: `turn off svc:${name} on this node; the admin removes the service definition`,
            argv: [bin, "serve", `--service=svc:${name}`, "--https=443", "off"],
        }),
    });
}
