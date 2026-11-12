/**
 * @fileoverview Product-neutral exposure-backend contract: how a set of loopback apps becomes
 * reachable at an edge URL, as a switchable backend with plan, apply, remove and status.
 *
 * This file owns the shared types, the injectable host command runner, and the manifest checks
 * every backend runs first (duplicate ports, protected ports, loopback-only targets). Concrete
 * backends live in `exposure-tailscale-serve.ts` and `exposure-plan-only.ts`.
 * Flow: adapter builds `LocalEdgeCore_ExposureManifest` -> backend `plan()` -> operator reviews the
 * dry-run actions -> backend `apply()` with `{ apply: true }` runs only the planned host commands.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure.unit.test.ts
 *
 * @see src/exposure-tailscale-serve.ts - Default backend that maps one tailnet-only HTTPS port per app.
 * @see src/exposure-plan-only.ts - Backends that need an owner or admin and only print a plan.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawnSync } from "node:child_process";

/** Loopback host every exposure target must use. Apps never bind to a public or tailnet address. */
export const LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST = "127.0.0.1";

/** One app the manifest wants reachable at an edge URL. */
export type LocalEdgeCore_ExposureApp = {
  /** Stable app id, also used as the service label by name-based backends. */
  id: string;
  /** Disabled apps are listed in plans as skipped and never touched. */
  enabled: boolean;
  /** Loopback port the app listens on. */
  localPort: number;
  /** Edge HTTPS port for port-based backends. */
  edgePort?: number | undefined;
  /** Name for name-based backends (service or DNS label). Defaults to `id`. */
  edgeName?: string | undefined;
  /**
   * Allow the port backend to replace an existing mapping that points at a different target.
   * Off by default: an existing foreign mapping is refused.
   */
  replaceExistingMapping?: boolean | undefined;
};

/** Backend-neutral manifest consumed by every exposure backend. */
export type LocalEdgeCore_ExposureManifest = {
  apps: readonly LocalEdgeCore_ExposureApp[];
  /** Edge ports the backend must never map, change or turn off. */
  protectedPorts: readonly number[];
  /** Edge hostname. Port backends fall back to the host's own tailnet DNS name. */
  hostname?: string | undefined;
  /** Root DNS zone for name-based backends that build `<name>.<zone>` hosts. */
  rootZone?: string | undefined;
};

/** What the backend would do (or refuses to do) for one app. */
export type LocalEdgeCore_ExposureActionKind =
  | "expose"
  | "unexpose"
  | "noop"
  | "skip"
  | "refuse"
  | "manual";

/** Who must act before a planned action can run. */
export type LocalEdgeCore_ExposureRequirement = "none" | "tailnet-admin" | "dns-tls-owner";

/** One planned action. `argv` is the exact host command, when there is one. */
export type LocalEdgeCore_ExposureAction = {
  kind: LocalEdgeCore_ExposureActionKind;
  appId: string;
  reason: string;
  requires: LocalEdgeCore_ExposureRequirement;
  edgeUrl?: string | undefined;
  target?: string | undefined;
  argv?: readonly string[] | undefined;
  /** Extra plan text for manual actions (for example a rendered config block). */
  detail?: string | undefined;
};

/** Plan produced by `plan()` or `planRemove()`. */
export type LocalEdgeCore_ExposurePlan = {
  backend: string;
  hostname: string | null;
  actions: readonly LocalEdgeCore_ExposureAction[];
  /** True when the backend can run this plan itself (no refusals, no manual steps). */
  applicable: boolean;
};

/** Observed state of one app at the edge. */
export type LocalEdgeCore_ExposureAppState =
  | "exposed"
  | "missing"
  | "conflict"
  | "protected"
  | "disabled"
  | "unknown";

/** Status row for one app. */
export type LocalEdgeCore_ExposureStatusEntry = {
  appId: string;
  state: LocalEdgeCore_ExposureAppState;
  edgeUrl: string | null;
  target: string;
  observedTarget: string | null;
  note: string;
};

/** Result of `apply()`: what ran, and whether every step succeeded. */
export type LocalEdgeCore_ExposureApplyResult = {
  backend: string;
  dryRun: boolean;
  ok: boolean;
  ran: readonly { argv: readonly string[]; status: number | null; stderr: string }[];
  message: string;
};

/** Options for `apply()`. Without `apply: true` the call is a dry run that runs nothing. */
export type LocalEdgeCore_ExposureApplyOptions = {
  apply?: boolean | undefined;
};

/** Switchable exposure backend. */
export type LocalEdgeCore_ExposureBackend = {
  readonly name: string;
  /** `none` when the backend can run without an admin or owner step. */
  readonly requires: LocalEdgeCore_ExposureRequirement;
  plan(manifest: LocalEdgeCore_ExposureManifest): LocalEdgeCore_ExposurePlan;
  planRemove(manifest: LocalEdgeCore_ExposureManifest): LocalEdgeCore_ExposurePlan;
  apply(
    plan: LocalEdgeCore_ExposurePlan,
    options?: LocalEdgeCore_ExposureApplyOptions,
  ): LocalEdgeCore_ExposureApplyResult;
  remove(
    manifest: LocalEdgeCore_ExposureManifest,
    options?: LocalEdgeCore_ExposureApplyOptions,
  ): LocalEdgeCore_ExposureApplyResult;
  status(manifest: LocalEdgeCore_ExposureManifest): readonly LocalEdgeCore_ExposureStatusEntry[];
};

/** Result of one host command. */
export type LocalEdgeCore_ExposureCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

/** Injectable host command runner. Tests pass a fake; nothing here shells out implicitly. */
export type LocalEdgeCore_ExposureCommandRunner = (
  command: string,
  args: readonly string[],
) => LocalEdgeCore_ExposureCommandResult;

/** Default runner: synchronous spawn, no shell, captured output, 15 s timeout. */
export const LocalEdgeCore_exposureDefaultCommandRunner: LocalEdgeCore_ExposureCommandRunner = (
  command,
  args,
) => {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.error ? String(result.error) : (result.stderr ?? ""),
  };
};

/** Loopback HTTP target for an app. */
export function LocalEdgeCore_exposureTargetUrl(localPort: number): string {
  return `http://${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}:${String(localPort)}`;
}

/** True for an integer TCP port in 1..65535. */
export function LocalEdgeCore_exposureIsPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * Checks the manifest shape every backend relies on. Returns a list of problems; empty means valid.
 *
 * @remarks
 * Duplicate edge ports, duplicate ids, invalid ports and enabled apps on protected ports are all
 * problems. Backends turn each problem into a `refuse` action instead of throwing, so the operator
 * sees the full plan.
 */
export function LocalEdgeCore_validateExposureManifest(
  manifest: LocalEdgeCore_ExposureManifest,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const edgePorts = new Map<number, string>();

  for (const port of manifest.protectedPorts) {
    if (!LocalEdgeCore_exposureIsPort(port)) {
      problems.push(`protected port ${String(port)} is not a valid TCP port`);
    }
  }

  for (const app of manifest.apps) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(app.id)) {
      problems.push(`app id "${app.id}" must be lowercase letters, digits and dashes`);
    }
    if (ids.has(app.id)) {
      problems.push(`app id "${app.id}" is listed twice`);
    }
    ids.add(app.id);
    if (!LocalEdgeCore_exposureIsPort(app.localPort)) {
      problems.push(`${app.id}: local port ${String(app.localPort)} is not a valid TCP port`);
    }
    if (app.edgePort !== undefined) {
      if (!LocalEdgeCore_exposureIsPort(app.edgePort)) {
        problems.push(`${app.id}: edge port ${String(app.edgePort)} is not a valid TCP port`);
      } else if (app.enabled) {
        const other = edgePorts.get(app.edgePort);
        if (other !== undefined) {
          problems.push(`${app.id}: edge port ${String(app.edgePort)} is also used by ${other}`);
        }
        edgePorts.set(app.edgePort, app.id);
      }
    }
  }

  return problems;
}

/** Builds a plan object and computes `applicable` from its actions. */
export function LocalEdgeCore_buildExposurePlan(options: {
  backend: string;
  hostname: string | null;
  actions: readonly LocalEdgeCore_ExposureAction[];
}): LocalEdgeCore_ExposurePlan {
  return {
    backend: options.backend,
    hostname: options.hostname,
    actions: options.actions,
    applicable: options.actions.every(
      (action) => action.kind !== "refuse" && action.kind !== "manual",
    ),
  };
}

/** Renders a plan as plain text lines for terminals. */
export function LocalEdgeCore_renderExposurePlanText(plan: LocalEdgeCore_ExposurePlan): string {
  const lines = [
    `backend: ${plan.backend}`,
    `hostname: ${plan.hostname ?? "(unresolved)"}`,
    `applicable: ${plan.applicable ? "yes" : "no"}`,
  ];
  for (const action of plan.actions) {
    const where = action.edgeUrl ? ` ${action.edgeUrl}` : "";
    const target = action.target ? ` -> ${action.target}` : "";
    const needs = action.requires === "none" ? "" : ` [needs ${action.requires}]`;
    lines.push(`  ${action.kind.padEnd(8)} ${action.appId}${where}${target}${needs}: ${action.reason}`);
    if (action.argv) {
      lines.push(`           $ ${action.argv.join(" ")}`);
    }
    if (action.detail) {
      for (const detailLine of action.detail.split("\n")) {
        lines.push(`           | ${detailLine}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Refusing `apply()` result shared by backends that cannot run the given plan. */
export function LocalEdgeCore_refusedExposureApply(options: {
  backend: string;
  dryRun: boolean;
  message: string;
}): LocalEdgeCore_ExposureApplyResult {
  return { backend: options.backend, dryRun: options.dryRun, ok: false, ran: [], message: options.message };
}
