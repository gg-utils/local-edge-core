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

import {
  type LocalEdgeCore_ExposureAction,
  type LocalEdgeCore_ExposureBackend,
  type LocalEdgeCore_ExposureManifest,
  type LocalEdgeCore_ExposurePlan,
  type LocalEdgeCore_ExposureRequirement,
  LocalEdgeCore_buildExposurePlan,
  LocalEdgeCore_exposureTargetUrl,
  LocalEdgeCore_refusedExposureApply,
  LocalEdgeCore_validateExposureManifest,
} from "./exposure.js";

/** Backend name for tailnet services. */
export const LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND = "tailscale-services";

type LocalEdgeCore_PlanOnlyActionBuilder = (options: {
  appId: string;
  name: string;
  localPort: number;
  manifest: LocalEdgeCore_ExposureManifest;
}) => Omit<LocalEdgeCore_ExposureAction, "appId" | "kind" | "requires" | "target">;

function LocalEdgeCore_createPlanOnlyBackend(options: {
  name: string;
  requires: Exclude<LocalEdgeCore_ExposureRequirement, "none">;
  buildExpose: LocalEdgeCore_PlanOnlyActionBuilder;
  buildRemove: LocalEdgeCore_PlanOnlyActionBuilder;
}): LocalEdgeCore_ExposureBackend {
  const build = (
    manifest: LocalEdgeCore_ExposureManifest,
    builder: LocalEdgeCore_PlanOnlyActionBuilder,
  ): LocalEdgeCore_ExposurePlan => {
    const problems = LocalEdgeCore_validateExposureManifest(manifest);
    const actions = manifest.apps.map((app): LocalEdgeCore_ExposureAction => {
      const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
      const base = { appId: app.id, requires: options.requires, target };
      if (!app.enabled) {
        return { ...base, kind: "skip", requires: "none", reason: "app is disabled" };
      }
      if (problems.length > 0) {
        return { ...base, kind: "refuse", reason: `manifest invalid: ${problems.join("; ")}` };
      }
      return {
        ...base,
        kind: "manual",
        ...builder({ appId: app.id, name: app.edgeName ?? app.id, localPort: app.localPort, manifest }),
      };
    });
    return LocalEdgeCore_buildExposurePlan({
      backend: options.name,
      hostname: manifest.hostname ?? null,
      actions,
    });
  };

  const refuse = (dryRun: boolean) =>
    LocalEdgeCore_refusedExposureApply({
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
    status: (manifest) =>
      manifest.apps.map((app) => ({
        appId: app.id,
        state: app.enabled ? "unknown" : "disabled",
        edgeUrl: null,
        target: LocalEdgeCore_exposureTargetUrl(app.localPort),
        observedTarget: null,
        note: `${options.name} is plan-only; status is not observed`,
      })),
  };
}

/** Creates the plan-only `tailscale-services` backend (`svc:<name>` per app). */
export function LocalEdgeCore_createTailscaleServicesBackend(
  options: { tailscaleBin?: string | undefined } = {},
): LocalEdgeCore_ExposureBackend {
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
