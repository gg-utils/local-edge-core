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

import {
  type LocalEdgeCore_ExposureAction,
  type LocalEdgeCore_ExposureBackend,
  type LocalEdgeCore_ExposureManifest,
  type LocalEdgeCore_ExposurePlan,
  type LocalEdgeCore_ExposureRequirement,
  LocalEdgeCore_buildExposurePlan,
  LocalEdgeCore_exposureIsDnsLabel,
  LocalEdgeCore_exposureIsDnsName,
  LocalEdgeCore_exposureTargetUrl,
  LocalEdgeCore_refusedExposureApply,
  LocalEdgeCore_validateExposureManifest,
} from "./exposure.js";
import { LocalEdgeCore_renderNginxServerBlock } from "./nginx.js";

/** Backend name for tailnet services. */
export const LOCAL_EDGE_CORE_TAILSCALE_SERVICES_BACKEND = "tailscale-services";

/** Backend name for wildcard DNS plus nginx. */
export const LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND = "wildcard-dns-nginx";

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
  /** Backend-specific checks on the effective name; any problem turns the app into `refuse`. */
  checkApp?: (options: { appId: string; name: string; manifest: LocalEdgeCore_ExposureManifest }) => string | null;
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
      const name = app.edgeName ?? app.id;
      const appProblem = options.checkApp?.({ appId: app.id, name, manifest }) ?? null;
      if (appProblem !== null) {
        return { ...base, kind: "refuse", reason: appProblem };
      }
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
export function LocalEdgeCore_createWildcardDnsNginxBackend(): LocalEdgeCore_ExposureBackend {
  return LocalEdgeCore_createPlanOnlyBackend({
    name: LOCAL_EDGE_CORE_WILDCARD_DNS_NGINX_BACKEND,
    requires: "dns-tls-owner",
    checkApp: ({ appId, name, manifest }) => {
      if (!LocalEdgeCore_exposureIsDnsLabel(name)) {
        return `${appId}: name ${JSON.stringify(name)} is not a single lowercase DNS label; nothing rendered`;
      }
      if (manifest.rootZone !== undefined && !LocalEdgeCore_exposureIsDnsName(`${name}.${manifest.rootZone}`)) {
        return `${appId}: host ${name}.${manifest.rootZone} is not a valid DNS name (253 characters at most); nothing rendered`;
      }
      return null;
    },
    buildExpose: ({ name, localPort, manifest }) => {
      const zone = manifest.rootZone ?? "<root-zone>";
      const host = `${name}.${zone}`;
      return {
        edgeUrl: `https://${host}`,
        reason: `DNS owner points *.${zone} here; TLS owner provides a *.${zone} certificate`,
        detail: LocalEdgeCore_renderNginxServerBlock({
          method: "nginx",
          listenHost: "127.0.0.1",
          listenPort: 443,
          serverNames: [host],
          tls: { certPath: `<cert-for-*.${zone}>`, keyPath: `<key-for-*.${zone}>` },
          surfaceHeader: name,
          upstreamHost: "127.0.0.1",
          upstreamPort: localPort,
          variableName: `upstream_${name.replace(/-/g, "_")}`,
          websocketSafe: true,
          routerHealthPath: "/__local-edge/router-health",
          routerHealthBody: "ok",
        }),
      };
    },
    buildRemove: ({ name, manifest }) => ({
      reason: `remove the ${name}.${manifest.rootZone ?? "<root-zone>"} server block and reload nginx`,
    }),
  });
}
