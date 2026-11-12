/**
 * @fileoverview `tailscale-serve-ports` exposure backend: one tailnet-only HTTPS port per app via
 * `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`.
 *
 * This file owns parsing `tailscale serve status --json`, resolving the host's tailnet DNS name,
 * and the guards: protected ports are refused, Funnel ports are refused, foreign mappings are
 * refused unless the app opts in, and turn-off only runs for a port whose single handler points at
 * the app's own loopback target. `apply()` is a dry run unless `{ apply: true }` is passed.
 * Every issued plan is recorded privately and frozen; `apply()` runs only that recorded copy,
 * refuses a plan object that was edited after it was issued, and re-reads status first so a port
 * that changed since planning is refused instead of overwritten or turned off.
 * Flow: `status --json` -> observed port map -> per-app action -> frozen record -> optional apply
 * (re-read status, compare every affected port, then run).
 *
 * @testing Node test runner (tsx): npm run test -- src/exposure-tailscale-serve.unit.test.ts
 *
 * @see src/exposure.ts - Shared backend contract, manifest validation and plan rendering.
 * @documentation reviewed=2026-11-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { LocalEdgeCore_buildExposurePlan, LocalEdgeCore_exposureDefaultCommandRunner, LocalEdgeCore_exposureIsPort, LocalEdgeCore_exposureTargetUrl, LocalEdgeCore_refusedExposureApply, LocalEdgeCore_validateExposureManifest, } from "./exposure.js";
import { LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE, LocalEdgeCore_messageAppLabel, LocalEdgeCore_messageQuoted, } from "./safe-message.js";
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
 *
 * @param jsonText - Raw stdout of `tailscale serve status --json`.
 * @returns Map from edge port to its kind (`web-proxy` only for exactly one `/` proxy handler),
 *   proxy target and Funnel flag.
 * @throws When the text is not JSON or not a JSON object.
 *
 * @example
 * ```typescript
 * const observed = LocalEdgeCore_parseTailscaleServeStatus(result.stdout);
 * observed.ports.get(8450)?.proxyTarget; // "http://127.0.0.1:3000" when mapped
 * ```
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
/**
 * Parses `tailscale status --json` and returns `Self.DNSName` without the trailing dot.
 *
 * @param jsonText - Raw stdout of `tailscale status --json`.
 * @returns The node DNS name, or `null` when `Self.DNSName` is missing or empty.
 * @throws When the text is not JSON.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_parseTailnetSelfDnsName('{"Self":{"DNSName":"node-a.tailnet.example."}}'); // "node-a.tailnet.example"
 * ```
 */
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
/**
 * Builds the exact serve command that maps `edgePort` to the app's loopback target.
 *
 * @param options - CLI binary, edge HTTPS port and loopback port; not validated here.
 * @returns `[bin, "serve", "--bg", "--https=<edgePort>", "http://127.0.0.1:<localPort>"]`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildTailscaleServeOnArgv({ tailscaleBin: "tailscale", edgePort: 8450, localPort: 3000 });
 * ```
 */
export function LocalEdgeCore_buildTailscaleServeOnArgv(options) {
    return [
        options.tailscaleBin,
        "serve",
        "--bg",
        `--https=${String(options.edgePort)}`,
        LocalEdgeCore_exposureTargetUrl(options.localPort),
    ];
}
/**
 * Builds the exact serve command that turns off `edgePort`.
 *
 * @param options - CLI binary and edge HTTPS port; not validated here.
 * @returns `[bin, "serve", "--https=<edgePort>", "off"]`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_buildTailscaleServeOffArgv({ tailscaleBin: "tailscale", edgePort: 8450 });
 * ```
 */
export function LocalEdgeCore_buildTailscaleServeOffArgv(options) {
    return [options.tailscaleBin, "serve", `--https=${String(options.edgePort)}`, "off"];
}
/**
 * Checks that an argv is one of the two command shapes this backend emits and that it does not
 * touch a protected port. `apply()` runs it again on its own frozen copy of each step.
 *
 * @param options - Candidate argv, expected CLI binary, and protected ports.
 * @returns `null` when allowed; otherwise a short reason (wrong binary, Funnel/reset/TCP/service
 *   flags, missing or protected `--https` port, or any other shape).
 *
 * @example
 * ```typescript
 * LocalEdgeCore_checkTailscaleServeArgv({
 *   argv: ["tailscale", "serve", "--https=443", "off"],
 *   tailscaleBin: "tailscale",
 *   protectedPorts: [443],
 * }); // "port 443 is protected"
 * ```
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
function LocalEdgeCore_samePortState(a, b) {
    if (a === null || b === null) {
        return a === b;
    }
    return a.port === b.port && a.kind === b.kind && a.proxyTarget === b.proxyTarget && a.funnel === b.funnel;
}
function LocalEdgeCore_edgeUrl(hostname, port) {
    if (hostname === null) {
        return null;
    }
    return port === 443 ? `https://${hostname}` : `https://${hostname}:${String(port)}`;
}
/**
 * Plans one app for `plan()`. Pure: all live state comes in through `observed`.
 *
 * @param options - The app, its manifest, observed serve state, edge hostname and CLI binary.
 * @returns `skip` (disabled), `refuse` (no edge port, protected, Funnel, non-proxy config, or a
 *   foreign target without `replaceExistingMapping`), `noop` (already mapped) or `expose` with argv.
 *
 * @example
 * ```typescript
 * const action = LocalEdgeCore_planTailscaleServeApp({ app, manifest, observed, hostname, tailscaleBin: "tailscale" });
 * if (action.kind === "expose") console.log(action.argv);
 * ```
 */
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
/**
 * Plans one app for `planRemove()`. Only turns off a port that points at this app's target.
 *
 * @param options - Same inputs as `LocalEdgeCore_planTailscaleServeApp`.
 * @returns `skip`, `noop` (port not mapped), `refuse` (protected, Funnel, or not owned by this
 *   app) or `unexpose` with the turn-off argv.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_planTailscaleServeRemoveApp({ app, manifest, observed, hostname, tailscaleBin: "tailscale" }).kind;
 * ```
 */
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
/**
 * Creates the default `tailscale-serve-ports` backend.
 *
 * @param options - Injectable command runner (default: real spawn) and CLI binary name.
 * @returns A backend whose `plan`/`planRemove` read `serve status` (and `status` when the manifest
 *   has no hostname); whose `apply` refuses foreign, edited or non-applicable plans, is a dry run
 *   without `{ apply: true }`, re-reads status and refuses changed ports before any mutation, and
 *   stops at the first failing command; and whose `remove` plans then applies a removal.
 *
 * @example
 * ```typescript
 * const backend = LocalEdgeCore_createTailscaleServePortsBackend();
 * const plan = backend.plan(manifest);
 * const result = backend.apply(plan, { apply: true });
 * if (!result.ok) console.error(result.message);
 * ```
 */
export function LocalEdgeCore_createTailscaleServePortsBackend(options = {}) {
    const runner = options.runner ?? LocalEdgeCore_exposureDefaultCommandRunner;
    const tailscaleBin = options.tailscaleBin ?? "tailscale";
    const name = LOCAL_EDGE_CORE_TAILSCALE_SERVE_PORTS_BACKEND;
    /**
     * Private, frozen record of every plan this instance issued. `apply()` executes only these
     * validated steps, never the caller's plan object, and refuses when the caller's plan no longer
     * matches the snapshot taken when it was issued.
     */
    const issuedPlans = new WeakMap();
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
        const steps = [];
        if (read !== null && read.ok) {
            manifest.apps.forEach((app, index) => {
                const action = actions[index];
                if (action !== undefined &&
                    (action.kind === "expose" || action.kind === "unexpose") &&
                    action.argv !== undefined &&
                    app.edgePort !== undefined) {
                    const seen = read.observed.ports.get(app.edgePort);
                    steps.push(Object.freeze({
                        appId: action.appId,
                        edgePort: app.edgePort,
                        argv: Object.freeze([...action.argv]),
                        expected: seen === undefined ? null : Object.freeze({ ...seen }),
                    }));
                }
            });
        }
        issuedPlans.set(plan, Object.freeze({
            snapshot: JSON.stringify(plan),
            applicable: plan.applicable,
            protectedPorts: Object.freeze([...manifest.protectedPorts]),
            steps: Object.freeze(steps),
        }));
        return plan;
    };
    const apply = (plan, applyOptions = {}) => {
        const dryRun = applyOptions.apply !== true;
        if (plan.backend !== name) {
            return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: `plan is for backend ${LocalEdgeCore_messageQuoted(plan.backend, LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE)}` });
        }
        const issued = issuedPlans.get(plan);
        if (issued === undefined) {
            return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: "plan was not built by this backend instance" });
        }
        if (JSON.stringify(plan) !== issued.snapshot) {
            return LocalEdgeCore_refusedExposureApply({
                backend: name,
                dryRun,
                message: "plan was changed after it was built; nothing applied, plan again",
            });
        }
        if (!issued.applicable) {
            const refused = plan.actions.filter((a) => a.kind === "refuse").map((a) => `${LocalEdgeCore_messageAppLabel(a.appId)}: ${a.reason}`);
            return LocalEdgeCore_refusedExposureApply({
                backend: name,
                dryRun,
                message: `plan has refusals, nothing applied: ${refused.join("; ")}`,
            });
        }
        const { steps, protectedPorts } = issued;
        for (const step of steps) {
            const problem = LocalEdgeCore_checkTailscaleServeArgv({ argv: step.argv, tailscaleBin, protectedPorts });
            if (problem !== null) {
                return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: `${LocalEdgeCore_messageAppLabel(step.appId)}: ${problem}` });
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
        const live = readObserved();
        if (!live.ok) {
            return LocalEdgeCore_refusedExposureApply({ backend: name, dryRun, message: `nothing applied: ${live.message}` });
        }
        for (const step of steps) {
            const now = live.observed.ports.get(step.edgePort);
            if (!LocalEdgeCore_samePortState(step.expected, now ?? null)) {
                return LocalEdgeCore_refusedExposureApply({
                    backend: name,
                    dryRun,
                    message: `${LocalEdgeCore_messageAppLabel(step.appId)}: edge port ${String(step.edgePort)} changed since the plan was built; nothing applied, plan again`,
                });
            }
        }
        const ran = [];
        for (const step of steps) {
            const [command, ...args] = step.argv;
            const result = runner(command ?? tailscaleBin, args);
            ran.push({ argv: step.argv, status: result.status, stderr: result.stderr.trim() });
            if (result.status !== 0) {
                return { backend: name, dryRun, ok: false, ran, message: `${LocalEdgeCore_messageAppLabel(step.appId)}: command failed, stopped` };
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
