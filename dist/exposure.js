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
export const LocalEdgeCore_exposureDefaultCommandRunner = (command, args) => {
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
export function LocalEdgeCore_exposureTargetUrl(localPort) {
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
export function LocalEdgeCore_exposureIsPort(value) {
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
export function LocalEdgeCore_exposureIsDnsLabel(value) {
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
export function LocalEdgeCore_exposureIsDnsName(value) {
    return (typeof value === "string" &&
        value.length > 0 &&
        value.length <= 253 &&
        value.split(".").every((label) => LocalEdgeCore_exposureIsDnsLabel(label)));
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
export function LocalEdgeCore_validateExposureManifest(manifest) {
    const problems = [];
    const ids = new Set();
    const edgePorts = new Map();
    for (const port of manifest.protectedPorts) {
        if (!LocalEdgeCore_exposureIsPort(port)) {
            problems.push(`protected port ${String(port)} is not a valid TCP port`);
        }
    }
    if (manifest.hostname !== undefined && !LocalEdgeCore_exposureIsDnsName(manifest.hostname)) {
        problems.push(`hostname ${JSON.stringify(manifest.hostname)} is not a lowercase DNS name`);
    }
    if (manifest.rootZone !== undefined && !LocalEdgeCore_exposureIsDnsName(manifest.rootZone)) {
        problems.push(`root zone ${JSON.stringify(manifest.rootZone)} is not a lowercase DNS name`);
    }
    for (const app of manifest.apps) {
        if (app.edgeName !== undefined && !LocalEdgeCore_exposureIsDnsLabel(app.edgeName)) {
            problems.push(`${app.id}: edge name ${JSON.stringify(app.edgeName)} is not a single lowercase DNS label`);
        }
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
            }
            else if (app.enabled) {
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
export function LocalEdgeCore_buildExposurePlan(options) {
    return {
        backend: options.backend,
        hostname: options.hostname,
        actions: options.actions,
        applicable: options.actions.every((action) => action.kind !== "refuse" && action.kind !== "manual"),
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
export function LocalEdgeCore_renderExposurePlanText(plan) {
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
export function LocalEdgeCore_refusedExposureApply(options) {
    return { backend: options.backend, dryRun: options.dryRun, ok: false, ran: [], message: options.message };
}
