/**
 * @fileoverview Owns product-neutral split-DNS text rendering, macOS resolver parsing, loopback-alias discovery, and DNS-audit argv/state helpers for local-edge orchestration.
 *
 * This file renders dnsmasq/resolver text and derives non-default 127/8 loopback aliases from explicit listen hosts without performing installs, sudo, `/etc/resolver` writes, or adapter catalog lookups.
 * Flow: method address rules + listener options -> dnsmasq/resolver text; listen hosts -> loopback aliases; argv + supported method tokens -> audit parse result; audit counters -> printable and artifact lines.
 *
 * @testing CLI: npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-kit/src/dns-audit-cli.ts - Kit-layer DNS audit CLI that wires LocalEdgeCore_parseDnsAuditCliArgs plus the render/record helpers from this module into an executable audit.
 * @see consumer local-edge adapter - Repo split-DNS planning script that consumes LocalEdgeCore_renderDnsmasqConfig and resolver path helpers when emitting plan artifacts.
 * @see packages/local-edge-core/src/dns.unit.test.ts - Node test runner regression module that locks rendering, resolver parsing, argv parsing, and audit formatting contracts owned here.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository file-overview standard that defines the tag order and @documentation metadata required by this header.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Builds the macOS resolver file path for a root zone. */
export function LocalEdgeCore_resolveMacosResolverPath(options) {
    return `${options.resolverDir.replace(/\/+$/g, "")}/${options.rootZone}`;
}
/** Renders one dnsmasq wildcard address line. */
export function LocalEdgeCore_renderDnsmasqAddressRule(rule) {
    return `address=/.${rule.method}.${rule.developerSlug}.${rule.rootZone}/${rule.ipAddress}`;
}
/** Renders dnsmasq config text for split-DNS routing. */
export function LocalEdgeCore_renderDnsmasqConfig(options) {
    const lines = [
        `port=${options.port}`,
        `listen-address=${options.listenAddress}`,
        "bind-interfaces",
    ];
    for (const rule of options.addressRules) {
        lines.push(LocalEdgeCore_renderDnsmasqAddressRule(rule));
    }
    lines.push("log-queries", `log-facility=${options.logPath}`);
    if (options.defaultIpAddress && options.defaultIpAddress.length > 0) {
        const rootZone = options.addressRules[0]?.rootZone;
        if (!rootZone) {
            throw new Error("[local-edge-core:dns] defaultIpAddress requires at least one address rule with rootZone.");
        }
        lines.push(`address=/.${rootZone}/${options.defaultIpAddress}`);
    }
    return `${lines.join("\n")}\n`;
}
/** Renders macOS resolver file content for a dnsmasq listener. */
export function LocalEdgeCore_renderMacosResolverContent(options) {
    return [
        `nameserver ${options.nameserver}`,
        `port ${options.port}`,
        `timeout ${String(options.timeoutSeconds)}`,
        `search_order ${String(options.searchOrder)}`,
        "",
    ].join("\n");
}
/** Parses the first nameserver and port directives from macOS resolver content. */
export function LocalEdgeCore_parseMacosResolverContent(content) {
    let nameserver = null;
    let port = null;
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("nameserver") && nameserver === null) {
            nameserver = trimmed.replace(/^nameserver\s+/, "").trim();
        }
        if (trimmed.startsWith("port") && port === null) {
            port = trimmed.replace(/^port\s+/, "").trim();
        }
    }
    return { nameserver, port };
}
/** Returns unique non-default 127/8 loopback aliases required by method listen hosts. */
export function LocalEdgeCore_collectRequiredLoopbackAliases(options) {
    const aliases = [];
    const seen = new Set();
    for (const listenHost of options.listenHosts) {
        if (!listenHost.startsWith("127.") || listenHost === "127.0.0.1") {
            continue;
        }
        if (seen.has(listenHost)) {
            continue;
        }
        seen.add(listenHost);
        aliases.push(listenHost);
    }
    return aliases;
}
/** Parses DNS audit argv against adapter-supplied method tokens and defaults. */
export function LocalEdgeCore_parseDnsAuditCliArgs(options) {
    let method = options.defaultMethod;
    let strict = options.defaultStrict;
    let runDirectDnsProbe = true;
    for (let index = 0; index < options.args.length; index += 1) {
        const argument = options.args[index];
        if (argument === "--method") {
            const value = options.args[index + 1] ?? "";
            if (value.length === 0) {
                return {
                    ok: false,
                    message: "[local-edge:dns-audit] --method requires a value.",
                    exitCode: 2,
                };
            }
            if (value !== "all" && !options.supportedMethods.includes(value)) {
                return {
                    ok: false,
                    message: `[local-edge:dns-audit] Unsupported --method '${value}'.`,
                    exitCode: 2,
                };
            }
            method = value;
            index += 1;
        }
        else if (argument === "--strict") {
            strict = true;
        }
        else if (argument === "--no-strict") {
            strict = false;
        }
        else if (argument === "--skip-direct-probe") {
            runDirectDnsProbe = false;
        }
        else {
            return {
                ok: false,
                message: `[local-edge:dns-audit] Unknown option: ${argument ?? ""}`,
                exitCode: 2,
            };
        }
    }
    if (method.length === 0) {
        return {
            ok: false,
            message: "[local-edge:dns-audit] --method requires a value.",
            exitCode: 2,
        };
    }
    return {
        ok: true,
        options: {
            method,
            strict,
            runDirectDnsProbe,
        },
    };
}
/** Builds an empty DNS audit counter state. */
export function LocalEdgeCore_createDnsAuditState() {
    return {
        checkTotal: 0,
        checkPassed: 0,
        checkFailed: 0,
        failures: [],
    };
}
/** Increments totals and pass count for one DNS audit check. */
export function LocalEdgeCore_recordDnsAuditPass(state) {
    state.checkTotal += 1;
    state.checkPassed += 1;
}
/** Increments totals, fail count, and appends a stable failure entry. */
export function LocalEdgeCore_recordDnsAuditFailure(options) {
    options.state.checkTotal += 1;
    options.state.checkFailed += 1;
    options.state.failures.push(`${options.label}: ${options.detail}`);
}
/** Formats a DNS audit pass line. */
export function LocalEdgeCore_formatDnsAuditPassLine(label) {
    return `[local-edge:dns-audit] OK ${label}`;
}
/** Formats a DNS audit warning line. */
export function LocalEdgeCore_formatDnsAuditWarningLine(options) {
    return `[local-edge:dns-audit] WARNING ${options.label} ${options.detail}`;
}
/** Formats the final DNS audit summary line. */
export function LocalEdgeCore_formatDnsAuditSummaryLine(state) {
    return `[local-edge:dns-audit] Summary checksPassed=${String(state.checkPassed)}/${String(state.checkTotal)} checksFailed=${String(state.checkFailed)}`;
}
/** Renders the DNS audit artifact body without writing to disk. */
export function LocalEdgeCore_renderDnsAuditArtifact(options) {
    const status = options.state.checkFailed > 0 ? "failed" : "ok";
    const failureLines = options.state.failures.length === 0 ? "none" : options.state.failures.join("\n");
    return `${[
        `runAt=${options.runAtIso}`,
        `method=${options.method}`,
        `strict=${String(options.strict)}`,
        `resolverPath=${options.resolverPath}`,
        `resolverNameserverExpected=${options.expectedNameserver}`,
        `resolverPortExpected=${options.expectedPort}`,
        `checksTotal=${String(options.state.checkTotal)}`,
        `checksPassed=${String(options.state.checkPassed)}`,
        `checksFailed=${String(options.state.checkFailed)}`,
        `status=${status}`,
        "failures<<EOF",
        failureLines,
        "EOF",
    ].join("\n")}\n`;
}
//# sourceMappingURL=dns.js.map