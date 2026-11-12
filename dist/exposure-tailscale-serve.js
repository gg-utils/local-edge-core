/**
 * @fileoverview `tailscale-serve-ports` exposure backend: one tailnet-only HTTPS port per app via
 * `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`.
 *
 * This file owns parsing `tailscale serve status --json`, resolving the host's tailnet DNS name,
 * and the guards: protected ports are refused, Funnel ports are refused, foreign mappings are
 * refused unless the app opts in, and turn-off only runs for a port whose single handler points at
 * the app's own loopback target. `apply()` is a dry run unless `{ apply: true }` is passed.
 * Flow: `status --json` -> observed port map -> per-app action -> optional apply -> re-read status.
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-tailscale-serve.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract, manifest validation and plan rendering.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureDefaultCommandRunner, LocalEdgeCore_exposureIsPort, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
/** Backend name used in config and on the command line. */
export const LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND = "tailscale-serve-ports";
function LocalEdgeCore_isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function LocalEdgeCore_normalizeTarget(target) {
    return target.replace(/\/+$/, "");
}
function LocalEdgeCore_portFromHostPortKey(key) {
    const match = /:(\d+)$/.exec(key);
    if (!match?.[1]) {
        return null;
    }
    const port = Number(match[1]);
    return LocalEdgeCore_exposureIsPort(port) ? port : null;
}
/**
 * Parses `tailscale serve status --json` output into a per-port map for the node itself.
 *
 * @remarks
 * Only top-level `TCP`, `Web` and `AllowFunnel` are read. `Services` belong to other hostnames and
 * are not port mappings of this node. Empty output means nothing is configured.
 */
export function LocalEdgeCore_parseTailscaleServeStatus(jsonText) {
    const trimmed = jsonText.trim();
    const ports = new Map();
    if (trimmed.length === 0) {
        return { ports };
    }
    const parsed = JSON.parse(trimmed);
    if (!LocalEdgeCore_isRecord(parsed)) {
        throw new Error("serve status JSON is not an object");
    }
    const funnelPorts = new Set();
    if (LocalEdgeCore_isRecord(parsed.AllowFunnel)) {
        for (const [key, enabled] of Object.entries(parsed.AllowFunnel)) {
            const port = LocalEdgeCore_portFromHostPortKey(key);
            if (port !== null && enabled === true) {
                funnelPorts.add(port);
            }
        }
    }
    const webByPort = new Map();
    if (LocalEdgeCore_isRecord(parsed.Web)) {
        for (const [key, value] of Object.entries(parsed.Web)) {
            const port = LocalEdgeCore_portFromHostPortKey(key);
            if (port !== null) {
                webByPort.set(port, value);
            }
        }
    }
    const tcp = LocalEdgeCore_isRecord(parsed.TCP) ? parsed.TCP : {};
    const allPorts = new Set([...webByPort.keys(), ...funnelPorts]);
    for (const key of Object.keys(tcp)) {
        const port = Number(key);
        if (LocalEdgeCore_exposureIsPort(port)) {
            allPorts.add(port);
        }
    }
    for (const port of allPorts) {
        const tcpEntry = tcp[String(port)];
        const funnel = funnelPorts.has(port);
        if (LocalEdgeCore_isRecord(tcpEntry) && typeof tcpEntry.TCPForward === "string") {
            ports.set(port, { port, kind: "tcp", proxyTarget: null, funnel });
            continue;
        }
        const web = webByPort.get(port);
        const handlers = LocalEdgeCore_isRecord(web) && LocalEdgeCore_isRecord(web.Handlers)
            ? web.Handlers
            : null;
        if (handlers === null) {
            ports.set(port, { port, kind: "unknown", proxyTarget: null, funnel });
            continue;
        }
        const entries = Object.entries(handlers);
        const root = handlers["/"];
        if (entries.length === 1 &&
            LocalEdgeCore_isRecord(root) &&
            typeof root.Proxy === "string") {
            ports.set(port, {
                port,
                kind: "web-proxy",
                proxyTarget: LocalEdgeCore_normalizeTarget(root.Proxy),
                funnel,
            });
            continue;
        }
        ports.set(port, { port, kind: "web-other", proxyTarget: null, funnel });
    }
    return { ports };
}
/** Parses `tailscale status --json` and returns `Self.DNSName` without the trailing dot. */
export function LocalEdgeCore_parseTailnetSelfDnsName(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!LocalEdgeCore_isRecord(parsed) || !LocalEdgeCore_isRecord(parsed.Self)) {
        return null;
    }
    const name = parsed.Self.DNSName;
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }
    return name.replace(/\.$/, "");
}
/** Builds the exact serve command that maps `edgePort` to the app's loopback target. */
export function LocalEdgeCore_buildTailscaleServeOnArgv(options) {
    return [
        options.tailscaleBin,
        "serve",
        "--bg",
        `--https=${String(options.edgePort)}`,
        LocalEdgeCore_exposureTargetUrl(options.localPort),
    ];
}
/** Builds the exact serve command that turns off `edgePort`. */
export function LocalEdgeCore_buildTailscaleServeOffArgv(options) {
    return [options.tailscaleBin, "serve", `--https=${String(options.edgePort)}`, "off"];
}
/**
 * Checks that an argv is one of the two command shapes this backend emits and that it does not
 * touch a protected port. Used by `apply()` so a hand-edited plan cannot widen what runs.
 */
export function LocalEdgeCore_checkTailscaleServeArgv(options) {
    const [bin, sub, ...rest] = options.argv;
    if (bin !== options.tailscaleBin || sub !== "serve") {
        return `not a ${options.tailscaleBin} serve command`;
    }
    if (rest.some((arg) => /funnel|reset|--tcp|--tls-terminated-tcp|--set-path|--service/i.test(arg))) {
        return "command shape not allowed";
    }
    const httpsArg = rest.find((arg) => arg.startsWith("--https="));
    const port = httpsArg ? Number(httpsArg.slice("--https=".length)) : NaN;
    if (!LocalEdgeCore_exposureIsPort(port)) {
        return "missing --https=<port>";
    }
    if (options.protectedPorts.includes(port)) {
        return `port ${String(port)} is protected`;
    }
    const isOn = rest.length === 3 &&
        rest[0] === "--bg" &&
        rest[1] === httpsArg &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(rest[2] ?? "");
    const isOff = rest.length === 2 && rest[0] === httpsArg && rest[1] === "off";
    return isOn || isOff ? null : "command shape not allowed";
}
function LocalEdgeCore_edgeUrl(hostname, port) {
    if (hostname === null) {
        return null;
    }
    return port === 443 ? `https://${hostname}` : `https://${hostname}:${String(port)}`;
}
/** Plans one app for `plan()`. Pure: all live state comes in through `observed`. */
export function LocalEdgeCore_planTailscaleServeApp(options) {
    const { app, manifest, observed, hostname } = options;
    const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
    const base = { appId: app.id, requires: "none", target };
    if (!app.enabled) {
        return { ...base, kind: "skip", reason: "app is disabled" };
    }
    if (app.edgePort === undefined) {
        return { ...base, kind: "skip", reason: "app has no edge port; not served by this backend" };
    }
    const edgeUrl = LocalEdgeCore_edgeUrl(hostname, app.edgePort) ?? undefined;
    const withUrl = { ...base, edgeUrl };
    if (manifest.protectedPorts.includes(app.edgePort)) {
        return { ...withUrl, kind: "refuse", reason: `edge port ${String(app.edgePort)} is protected` };
    }
    const current = observed.ports.get(app.edgePort);
    if (current?.funnel) {
        return { ...withUrl, kind: "refuse", reason: "edge port has Funnel on; Funnel is never used" };
    }
    if (current === undefined) {
        return {
            ...withUrl,
            kind: "expose",
            reason: "port is free",
            argv: LocalEdgeCore_buildTailscaleServeOnArgv({
                tailscaleBin: options.tailscaleBin,
                edgePort: app.edgePort,
                localPort: app.localPort,
            }),
        };
    }
    if (current.kind === "web-proxy" && current.proxyTarget === target) {
        return { ...withUrl, kind: "noop", reason: "already mapped to this target" };
    }
    if (current.kind !== "web-proxy") {
        return {
            ...withUrl,
            kind: "refuse",
            reason: `port already has a ${current.kind} config that this backend never replaces`,
        };
    }
    if (app.replaceExistingMapping === true) {
        return {
            ...withUrl,
            kind: "expose",
            reason: `replacing ${current.proxyTarget ?? "?"} (replaceExistingMapping is on)`,
            argv: LocalEdgeCore_buildTailscaleServeOnArgv({
                tailscaleBin: options.tailscaleBin,
                edgePort: app.edgePort,
                localPort: app.localPort,
            }),
        };
    }
    return {
        ...withUrl,
        kind: "refuse",
        reason: `port is mapped to a different target ${current.proxyTarget ?? "?"}`,
    };
}
/** Plans one app for `planRemove()`. Only turns off a port that points at this app's target. */
export function LocalEdgeCore_planTailscaleServeRemoveApp(options) {
    const { app, manifest, observed, hostname } = options;
    const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
    const base = { appId: app.id, requires: "none", target };
    if (!app.enabled) {
        return { ...base, kind: "skip", reason: "app is disabled" };
    }
    if (app.edgePort === undefined) {
        return { ...base, kind: "skip", reason: "app has no edge port" };
    }
    const withUrl = { ...base, edgeUrl: LocalEdgeCore_edgeUrl(hostname, app.edgePort) ?? undefined };
    if (manifest.protectedPorts.includes(app.edgePort)) {
        return { ...withUrl, kind: "refuse", reason: `edge port ${String(app.edgePort)} is protected` };
    }
    const current = observed.ports.get(app.edgePort);
    if (current === undefined) {
        return { ...withUrl, kind: "noop", reason: "port is not mapped" };
    }
    if (current.funnel) {
        return { ...withUrl, kind: "refuse", reason: "edge port has Funnel on; left untouched" };
    }
    if (current.kind === "web-proxy" && current.proxyTarget === target) {
        return {
            ...withUrl,
            kind: "unexpose",
            reason: "port maps to this app",
            argv: LocalEdgeCore_buildTailscaleServeOffArgv({
                tailscaleBin: options.tailscaleBin,
                edgePort: app.edgePort,
            }),
        };
    }
    return {
        ...withUrl,
        kind: "refuse",
        reason: "port maps to something else; not owned by this app, left untouched",
    };
}
/** Creates the default `tailscale-serve-ports` backend. */
export function LocalEdgeCore_createTailscaleServePortsBackend(options = {}) {
    const runner = options.runner ?? LocalEdgeCore_exposureDefaultCommandRunner;
    const tailscaleBin = options.tailscaleBin ?? "tailscale";
    const name = LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND;
    /** Protected ports of the last planned manifest, re-checked at apply time. */
    const protectedByPlan = new WeakMap();
    const readObserved = () => {
        const result = runner(tailscaleBin, ["serve", "status", "--json"]);
        if (result.status !== 0) {
            return { ok: false, message: `serve status failed: ${result.stderr.trim() || "no output"}` };
        }
        try {
            return { ok: true, observed: LocalEdgeCore_parseTailscaleServeStatus(result.stdout) };
        }
        catch (error) {
            return { ok: false, message: `serve status JSON unreadable: ${String(error)}` };
        }
    };
    const resolveHostname = (manifest) => {
        if (manifest.hostname) {
            return manifest.hostname;
        }
        const result = runner(tailscaleBin, ["status", "--json"]);
        if (result.status !== 0) {
            return null;
        }
        try {
            return LocalEdgeCore_parseTailnetSelfDnsName(result.stdout);
        }
        catch {
            return null;
        }
    };
    const buildPlan = (manifest, planApp) => {
        const hostname = resolveHostname(manifest);
        const problems = LocalEdgeCore_validateExposureManifest(manifest);
        const read = problems.length === 0 ? readObserved() : null;
        const actions = manifest.apps.map((app) => {
            const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
            if (problems.length > 0) {
                return { appId: app.id, kind: "refuse", requires: "none", target, reason: `manifest invalid: ${problems.join("; ")}` };
            }
            if (read === null || !read.ok) {
                return { appId: app.id, kind: "refuse", requires: "none", target, reason: read?.message ?? "no serve status" };
            }
            return planApp({ app, manifest, observed: read.observed, hostname, tailscaleBin });
        });
        const plan = LocalEdgeCore_buildExposurePlan({ backend: name, hostname, actions });
        protectedByPlan.set(plan, [...manifest.protectedPorts]);
        return plan;
    };
    const apply = (plan, applyOptions = {}) => {
        const dryRun = applyOptions.apply !== true;
        if (plan.backend !== name) {
            return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: `plan is for backend ${plan.backend}` });
        }
        const protectedPorts = protectedByPlan.get(plan);
        if (protectedPorts === undefined) {
            return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: "plan was not built by this backend instance" });
        }
        if (!plan.applicable) {
            const refused = plan.actions.filter((a) => a.kind === "refuse").map((a) => `${a.appId}: ${a.reason}`);
            return LocalEdgeCore_refusedExposureApply({
                backend: name,
                dryRun,
                message: `plan has refusals, nothing applied: ${refused.join("; ")}`,
            });
        }
        const steps = plan.actions.filter((a) => (a.kind === "expose" || a.kind === "unexpose") && a.argv);
        for (const step of steps) {
            const problem = LocalEdgeCore_checkTailscaleServeArgv({ argv: step.argv ?? [], tailscaleBin, protectedPorts });
            if (problem !== null) {
                return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: `${step.appId}: ${problem}` });
            }
        }
        if (steps.length === 0) {
            return { backend: name, dryRun, ok: true, ran: [], message: "nothing to do: every app already matches" };
        }
        if (dryRun) {
            return {
                backend: name,
                dryRun,
                ok: true,
                ran: [],
                message: `dry run, pass --apply to run ${String(steps.length)} command(s)`,
            };
        }
        const ran = [];
        for (const step of steps) {
            const [command, ...args] = step.argv ?? [];
            const result = runner(command ?? tailscaleBin, args);
            ran.push({ argv: step.argv ?? [], status: result.status, stderr: result.stderr.trim() });
            if (result.status !== 0) {
                return { backend: name, dryRun, ok: false, ran, message: `${step.appId}: command failed, stopped` };
            }
        }
        return { backend: name, dryRun, ok: true, ran, message: `ran ${String(ran.length)} command(s)` };
    };
    return {
        name,
        requires: "none",
        readObserved,
        resolveHostname,
        plan: (manifest) => buildPlan(manifest, LocalEdgeCore_planTailscaleServeApp),
        planRemove: (manifest) => buildPlan(manifest, LocalEdgeCore_planTailscaleServeRemoveApp),
        apply,
        remove: (manifest, removeOptions) => apply(buildPlan(manifest, LocalEdgeCore_planTailscaleServeRemoveApp), removeOptions),
        status: (manifest) => {
            const hostname = resolveHostname(manifest);
            const read = readObserved();
            return manifest.apps.map((app) => {
                const target = LocalEdgeCore_exposureTargetUrl(app.localPort);
                const edgeUrl = app.edgePort === undefined ? null : LocalEdgeCore_edgeUrl(hostname, app.edgePort);
                const row = { appId: app.id, edgeUrl, target };
                if (!app.enabled) {
                    return { ...row, state: "disabled", observedTarget: null, note: "disabled in manifest" };
                }
                if (app.edgePort === undefined) {
                    return { ...row, state: "unknown", observedTarget: null, note: "no edge port" };
                }
                if (manifest.protectedPorts.includes(app.edgePort)) {
                    return { ...row, state: "protected", observedTarget: null, note: "edge port is protected" };
                }
                if (!read.ok) {
                    return { ...row, state: "unknown", observedTarget: null, note: read.message };
                }
                const current = read.observed.ports.get(app.edgePort);
                if (current === undefined) {
                    return { ...row, state: "missing", observedTarget: null, note: "port not mapped" };
                }
                if (current.kind === "web-proxy" && current.proxyTarget === target && !current.funnel) {
                    return { ...row, state: "exposed", observedTarget: current.proxyTarget, note: "tailnet only" };
                }
                return {
                    ...row,
                    state: "conflict",
                    observedTarget: current.proxyTarget,
                    note: current.funnel ? "Funnel on" : `port has ${current.kind} config`,
                };
            });
        },
    };
}
