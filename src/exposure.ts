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

import {
  LocalEdgeCore_messageAppLabel,
  LocalEdgeCore_messageInputSize,
  LocalEdgeCore_messageNumber,
} from "./safe-message.js";

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
  /**
   * Extra path routes for name-based backends, in addition to `/` -> `localPort`. Each sends
   * `path` to `127.0.0.1:<localPort><upstreamPath>`; `upstreamPath` defaults to `path`.
   */
  locations?: readonly LocalEdgeCore_ExposureAppLocation[] | undefined;
  /**
   * Hostname pattern for this app only, for name-based backends; wins over the settings' pattern.
   * Same tokens as `hostnameTemplate`. The host must still sit directly under a configured wildcard.
   */
  hostnameTemplate?: string | undefined;
  /**
   * Exact host for name-based backends; wins over every pattern. It must still sit directly under
   * a configured wildcard. Meant for route-only apps listed per machine.
   */
  host?: string | undefined;
  /** Proxy overrides for the `/` location. */
  proxy?: LocalEdgeCore_ExposureProxyOptions | undefined;
};

/** Per-location proxy overrides for name-based backends. */
export type LocalEdgeCore_ExposureProxyOptions = {
  /**
   * `Host` header sent upstream instead of the client's, for servers that refuse unknown hosts
   * (for example a dev server that only accepts `127.0.0.1:<port>`).
   */
  upstreamHost?: string | undefined;
  /** `false` turns response buffering off, for streams such as server-sent events. Default on. */
  buffering?: boolean | undefined;
  /** nginx `proxy_read_timeout`. Default `300s`. */
  readTimeout?: string | undefined;
};

/** One loopback port the router's HTTP server blocks listen on. */
export type LocalEdgeCore_ExposureRouterListener = {
  port: number;
  /** Terminate TLS on this port. Default true. */
  ssl?: boolean | undefined;
  /**
   * Port clients see for requests on this listener, written into `X-Forwarded-Host` and
   * `X-Forwarded-Port`. Default: `edgePort` for `routerPort`, else the listener's own port.
   */
  clientPort?: number | undefined;
};

/** One SNI route of the stream router. */
export type LocalEdgeCore_ExposureStreamRoute = {
  /** `map` key matched against the SNI name: an exact name or an nginx regex such as `~\.example\.test$`. */
  serverName: string;
  /** `host:port` the raw TLS stream goes to. */
  upstream: string;
};

/**
 * Extra loopback listeners that let a trusted front pass the client address with the PROXY
 * protocol (for example a tailnet TCP forward with PROXY protocol turned on). Used when
 * `clientAddress` is `"proxy-protocol"`. Every port must be a valid, unprotected port that no
 * other listener, stream or app uses, and the three must differ.
 */
export type LocalEdgeCore_ExposureProxyProtocolPorts = {
  /** Loopback port of the extra stream listener that reads the PROXY header, then the SNI name. */
  streamPort: number;
  /** Loopback port of the extra TLS HTTP listener (with `proxy_protocol`) the app names go to. */
  httpPort: number;
  /**
   * Loopback port of a small stream relay for names that go to the default upstream. That
   * upstream does not accept the PROXY protocol, so the relay reads the header and forwards plain.
   */
  relayPort: number;
  /**
   * Port clients see for requests on the extra HTTP listener, written into `X-Forwarded-Host` and
   * `X-Forwarded-Port`. Default: the client port of the listener the first stream route points at.
   */
  httpClientPort?: number | undefined;
};

/**
 * A raw-TCP listener that reads the SNI name without terminating TLS (`ssl_preread`) and passes the
 * stream on: matching names to the router's own listeners, anything else to a default upstream.
 */
export type LocalEdgeCore_ExposureStreamRouter = {
  /** Loopback port of the stream listener. */
  port: number;
  routes: readonly LocalEdgeCore_ExposureStreamRoute[];
  /** `host:port` for names no route matches. */
  defaultUpstream: string;
  /** nginx `proxy_connect_timeout`. Default `5s`. */
  connectTimeout?: string | undefined;
};

/**
 * One extra path route of an app. `upstreamPath` defaults to `path`; an empty string passes the
 * request URI through unchanged.
 */
export type LocalEdgeCore_ExposureAppLocation = LocalEdgeCore_ExposureProxyOptions & {
  path: string;
  localPort: number;
  upstreamPath?: string | undefined;
};

/** Parts a hostname pattern receives for one app. */
export type LocalEdgeCore_ExposureHostnameParts = {
  app: string;
  realm: string;
  mainRealm: string;
  projectMachineLabel: string;
  rootZone: string;
};

/**
 * Settings for the `hostnames` backend. Names are public DNS under a zone the owner controls;
 * the default pattern is `<app>.<projectMachineLabel>.<rootZone>` for the main realm and
 * `<app>--<realm>.<projectMachineLabel>.<rootZone>` otherwise, so one wildcard covers every host.
 */
export type LocalEdgeCore_ExposureHostnamesConfig = {
  /** One DNS label naming the project and machine, for example `proj-node1`. */
  projectMachineLabel: string;
  rootZone: string;
  /** Realm (branch or worktree) name; sanitized into a slug. */
  realm: string;
  /** Realm that gets plain `<app>` labels. Defaults to `main`. */
  mainRealm?: string | undefined;
  /**
   * Hostname template with `{app}`, `{realm}`, `{label}`, `{projectMachine}`, `{rootZone}`.
   * Default `{label}.{projectMachine}.{rootZone}`.
   */
  hostnameTemplate?: string | undefined;
  /** Function form of the pattern; wins over `hostnameTemplate`. */
  buildHostname?: ((parts: LocalEdgeCore_ExposureHostnameParts) => string) | undefined;
  /** Wildcard that every host must sit directly under. Default `*.{projectMachine}.{rootZone}`. */
  wildcardTemplate?: string | undefined;
  /**
   * More wildcards hosts may sit under (same tokens as `wildcardTemplate`), for apps whose
   * `hostnameTemplate` uses another label. The certificate and DNS steps cover every wildcard.
   */
  extraWildcardTemplates?: readonly string[] | undefined;
  /** Loopback router listen host. Must be 127.0.0.1. */
  routerHost: string;
  routerPort: number;
  /** Port clients use, such as a Serve TCP port in front of the router. Defaults to `routerPort`. */
  edgePort?: number | undefined;
  /**
   * Every loopback port the HTTP server blocks listen on. Omitted: one TLS listener on
   * `routerPort`. When given it must include `routerPort`; each listener gets the 421 default
   * server and every host block.
   */
  listeners?: readonly LocalEdgeCore_ExposureRouterListener[] | undefined;
  /** Optional SNI stream router in front of the listeners. */
  stream?: LocalEdgeCore_ExposureStreamRouter | undefined;
  /**
   * Where the client address comes from. `"connection"` (default): the TCP peer of the listener.
   * `"proxy-protocol"`: the render also adds listeners that read it from a PROXY protocol header
   * (needs `stream` and `proxyProtocol`); every existing listener stays as it is.
   */
  clientAddress?: "connection" | "proxy-protocol" | undefined;
  /** Ports of the extra PROXY protocol listeners. Required when `clientAddress` is `"proxy-protocol"`. */
  proxyProtocol?: LocalEdgeCore_ExposureProxyProtocolPorts | undefined;
  /** Certificate and key the router uses; kept in a 0700 folder outside any git checkout. */
  tls: { mode: "provided"; certPath: string; keyPath: string };
  /** Where the rendered router config lives and what it writes. All paths absolute. */
  nginx: {
    confPath: string;
    pidPath: string;
    errorLogPath: string;
    accessLogPath: string;
    /** Folder for nginx temp files (client bodies, proxy buffers). */
    tempDir: string;
    /** `mime.types` file to include. Omitted: no include (the router only proxies). */
    mimeTypesPath?: string | undefined;
    /** `worker_connections`. Default 512. */
    workerConnections?: number | undefined;
  };
  /** Plan-only ACME DNS-01 issuing step. Omit to leave issuing out of the plan. */
  acme?:
    | {
        client: "lego";
        dnsProvider: string;
        dataDir: string;
        /** ACME account email. Left out of the command when omitted. */
        email?: string | undefined;
        /** ACME directory URL. lego's default when omitted. */
        server?: string | undefined;
        keyType?: string | undefined;
        /** Script lego runs after issuing; copies the cert and key to `tls` paths. */
        deployHook?: string | undefined;
        /** Wrapper the owner runs to issue and renew (sources the token file, then runs lego). */
        runScript?: string | undefined;
        /** How renewal is scheduled, for the plan text (for example a launch agent). */
        renewal?: string | undefined;
        /** Install step shown in the plan, never run. Defaults to `brew install lego`. */
        installArgv?: readonly string[] | undefined;
      }
    | undefined;
  /** Tailnet addresses for the wildcard records. Read from `tailscale status --json` when omitted. */
  addresses?: { ipv4?: string | undefined; ipv6?: string | undefined } | undefined;
  /** The owner reports the wildcard records are live; the DNS step becomes a noop. */
  dnsLive?: boolean | undefined;
  /** Plan a tailnet raw-TCP Serve mapping of the router port. Defaults to true. */
  tailnetTcp?: boolean | undefined;
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
  /** Settings for the hostname backend; required only when that backend is selected. */
  hostnames?: LocalEdgeCore_ExposureHostnamesConfig | undefined;
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

/**
 * Default runner: synchronous spawn, no shell, captured output, 15 s timeout.
 *
 * @param command - Binary to run; looked up on PATH, never passed through a shell.
 * @param args - Exact argument list.
 * @returns Exit status (`null` on timeout or spawn failure), stdout, and stderr; a spawn error is
 *   reported in `stderr` instead of being thrown.
 *
 * @example
 * ```typescript
 * const result = LocalEdgeCore_exposureDefaultCommandRunner("tailscale", ["serve", "status", "--json"]);
 * if (result.status !== 0) console.error(result.stderr);
 * ```
 */
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

/**
 * Loopback HTTP target for an app.
 *
 * @param localPort - Port the app listens on; not range-checked here (see the manifest check).
 * @returns `http://127.0.0.1:<localPort>`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_exposureTargetUrl(3000); // "http://127.0.0.1:3000"
 * ```
 */
export function LocalEdgeCore_exposureTargetUrl(localPort: number): string {
  return `http://${LOCAL_EDGE_CORE_EXPOSURE_LOOPBACK_HOST}:${String(localPort)}`;
}

/**
 * True for an integer TCP port in 1..65535.
 *
 * @param value - Any value; strings, floats, `0` and out-of-range numbers are `false`.
 * @returns Whether `value` is a usable TCP port. Never throws.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_exposureIsPort(8450); // true
 * LocalEdgeCore_exposureIsPort("8450"); // false
 * ```
 */
export function LocalEdgeCore_exposureIsPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * True for one lowercase DNS label: 1..63 letters, digits and inner dashes.
 *
 * @param value - Candidate label, for example an app `edgeName`.
 * @returns `true` only for `[a-z0-9]` at both ends with `[a-z0-9-]` between, at most 63 characters.
 *   Anything else (dots, spaces, `;`, newlines, uppercase, empty) is `false`; it never throws.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_exposureIsDnsLabel("web"); // true
 * LocalEdgeCore_exposureIsDnsLabel("web;\nreturn 200"); // false
 * ```
 */
export function LocalEdgeCore_exposureIsDnsLabel(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

/**
 * True for a lowercase dotted DNS name of at most 253 characters whose every label passes
 * `LocalEdgeCore_exposureIsDnsLabel`.
 *
 * @param value - Candidate name, for example a manifest `rootZone` or `hostname`.
 * @returns `false` for an empty name, a trailing dot, an empty label, any unsafe character, or a
 *   name longer than 253 characters; it never throws.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_exposureIsDnsName("dev.example.test"); // true
 * LocalEdgeCore_exposureIsDnsName("dev.example.test;"); // false
 * ```
 */
export function LocalEdgeCore_exposureIsDnsName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 253 &&
    value.split(".").every((label) => LocalEdgeCore_exposureIsDnsLabel(label))
  );
}

/**
 * Checks the manifest shape every backend relies on. Returns a list of problems; empty means valid.
 *
 * @remarks
 * Duplicate edge ports, duplicate ids, invalid ports and enabled apps on protected ports are all
 * problems. Backends turn each problem into a `refuse` action instead of throwing, so the operator
 * sees the full plan. Names that a backend may render into host config (`edgeName`, `rootZone`,
 * `hostname`) must be plain DNS labels or names, so no backend can be handed config syntax.
 *
 * @param manifest - Manifest to check. It is only read.
 * @returns One human-readable problem per defect, in manifest order; an empty array means valid.
 *   It never throws.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_validateExposureManifest({
 *   protectedPorts: [443],
 *   apps: [{ id: "web", enabled: true, localPort: 3000, edgePort: 443 }],
 * }); // [] here; an enabled app on 443 is refused by the backend planner, not by this check
 * ```
 */
export function LocalEdgeCore_validateExposureManifest(
  manifest: LocalEdgeCore_ExposureManifest,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const edgePorts = new Map<number, string>();

  for (const port of manifest.protectedPorts) {
    if (!LocalEdgeCore_exposureIsPort(port)) {
      problems.push(`protected port ${LocalEdgeCore_messageNumber(port)} is not a valid TCP port`);
    }
  }

  if (manifest.hostname !== undefined && !LocalEdgeCore_exposureIsDnsName(manifest.hostname)) {
    problems.push(`hostname (${LocalEdgeCore_messageInputSize(manifest.hostname)}) is not a lowercase DNS name`);
  }
  if (manifest.rootZone !== undefined && !LocalEdgeCore_exposureIsDnsName(manifest.rootZone)) {
    problems.push(`root zone (${LocalEdgeCore_messageInputSize(manifest.rootZone)}) is not a lowercase DNS name`);
  }

  for (const [index, app] of manifest.apps.entries()) {
    // The id is named only after it passed the shape check; otherwise the app is named by position.
    const who = LocalEdgeCore_messageAppLabel(app.id, index);
    if (app.edgeName !== undefined && !LocalEdgeCore_exposureIsDnsLabel(app.edgeName)) {
      problems.push(`${who}: edge name (${LocalEdgeCore_messageInputSize(app.edgeName)}) is not a single lowercase DNS label`);
    }
    if (typeof app.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(app.id)) {
      problems.push(`${who}: app id (${LocalEdgeCore_messageInputSize(app.id)}) must be lowercase letters, digits and dashes`);
    }
    if (ids.has(app.id)) {
      problems.push(`${who}: app id is listed twice`);
    }
    ids.add(app.id);
    if (!LocalEdgeCore_exposureIsPort(app.localPort)) {
      problems.push(`${who}: local port ${LocalEdgeCore_messageNumber(app.localPort)} is not a valid TCP port`);
    }
    if (app.edgePort !== undefined) {
      if (!LocalEdgeCore_exposureIsPort(app.edgePort)) {
        problems.push(`${who}: edge port ${LocalEdgeCore_messageNumber(app.edgePort)} is not a valid TCP port`);
      } else if (app.enabled) {
        const other = edgePorts.get(app.edgePort);
        if (other !== undefined) {
          problems.push(`${who}: edge port ${String(app.edgePort)} is also used by ${LocalEdgeCore_messageAppLabel(other)}`);
        }
        edgePorts.set(app.edgePort, app.id);
      }
    }
  }

  return problems;
}

/**
 * Builds a plan object and computes `applicable` from its actions.
 *
 * @param options - Backend name, resolved edge hostname (or `null`), and the per-app actions.
 * @returns A new plan whose `applicable` is `true` only when no action is `refuse` or `manual`.
 *
 * @example
 * ```typescript
 * const plan = LocalEdgeCore_buildExposurePlan({
 *   backend: "tailscale-serve-ports",
 *   hostname: "node-a.tailnet.example",
 *   actions: [{ appId: "web", kind: "noop", requires: "none", reason: "already mapped" }],
 * });
 * plan.applicable; // true
 * ```
 */
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

/**
 * Renders a plan as plain text lines for terminals.
 *
 * @param plan - Plan to print; only read.
 * @returns Header lines (backend, hostname, applicable), one line per action, the action's argv
 *   after `$`, and each `detail` line after `|`, ending with a newline.
 *
 * @example
 * ```typescript
 * process.stdout.write(LocalEdgeCore_renderExposurePlanText(backend.plan(manifest)));
 * ```
 */
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
    lines.push(`  ${action.kind.padEnd(8)} ${LocalEdgeCore_messageAppLabel(action.appId)}${where}${target}${needs}: ${action.reason}`);
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

/**
 * Refusing `apply()` result shared by backends that cannot run the given plan.
 *
 * @param options - Backend name, whether the call was a dry run, and the refusal message.
 * @returns `{ ok: false, ran: [] }` with the given message: nothing ran.
 *
 * @example
 * ```typescript
 * return LocalEdgeCore_refusedExposureApply({ backend: "x", dryRun: true, message: "plan-only" });
 * ```
 */
export function LocalEdgeCore_refusedExposureApply(options: {
  backend: string;
  dryRun: boolean;
  message: string;
}): LocalEdgeCore_ExposureApplyResult {
  return { backend: options.backend, dryRun: options.dryRun, ok: false, ran: [], message: options.message };
}
