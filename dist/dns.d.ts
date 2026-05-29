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
/** One split-DNS wildcard address rule for a local-edge routing method. */
export type LocalEdgeCore_SplitDnsAddressRule = {
    method: string;
    developerSlug: string;
    rootZone: string;
    ipAddress: string;
};
/** Options for rendering a dnsmasq local-edge config file. */
export type LocalEdgeCore_RenderDnsmasqConfigOptions = {
    port: string;
    listenAddress: string;
    addressRules: readonly LocalEdgeCore_SplitDnsAddressRule[];
    logPath: string;
    defaultIpAddress: string | null;
};
/** Options for rendering a macOS `/etc/resolver/<zone>` file. */
export type LocalEdgeCore_RenderMacosResolverOptions = {
    nameserver: string;
    port: string;
    timeoutSeconds: number;
    searchOrder: number;
};
/** Parsed resolver file fields relevant to local-edge audit checks. */
export type LocalEdgeCore_ParsedMacosResolver = {
    nameserver: string | null;
    port: string | null;
};
/** Options for computing loopback alias requirements from method listen hosts. */
export type LocalEdgeCore_RequiredLoopbackAliasesOptions = {
    listenHosts: readonly string[];
};
/** Parsed DNS audit CLI runtime options, with adapter-supplied method tokens. */
export type LocalEdgeCore_DnsAuditOptions = {
    readonly method: string;
    readonly strict: boolean;
    readonly runDirectDnsProbe: boolean;
};
/** Result of DNS audit argv parsing without package-owned process exits. */
export type LocalEdgeCore_DnsAuditParseResult = {
    readonly ok: true;
    readonly options: LocalEdgeCore_DnsAuditOptions;
} | {
    readonly ok: false;
    readonly message: string;
    readonly exitCode: 2;
};
/** Running counters and failure messages accumulated across DNS audit tiers. */
export type LocalEdgeCore_DnsAuditState = {
    checkTotal: number;
    checkPassed: number;
    checkFailed: number;
    failures: string[];
};
/** Options for rendering a DNS audit artifact body. */
export type LocalEdgeCore_RenderDnsAuditArtifactOptions = {
    readonly state: LocalEdgeCore_DnsAuditState;
    readonly runAtIso: string;
    readonly method: string;
    readonly strict: boolean;
    readonly resolverPath: string;
    readonly expectedNameserver: string;
    readonly expectedPort: string;
};
/** Builds the macOS resolver file path for a root zone. */
export declare function LocalEdgeCore_resolveMacosResolverPath(options: {
    resolverDir: string;
    rootZone: string;
}): string;
/** Renders one dnsmasq wildcard address line. */
export declare function LocalEdgeCore_renderDnsmasqAddressRule(rule: LocalEdgeCore_SplitDnsAddressRule): string;
/** Renders dnsmasq config text for split-DNS routing. */
export declare function LocalEdgeCore_renderDnsmasqConfig(options: LocalEdgeCore_RenderDnsmasqConfigOptions): string;
/** Renders macOS resolver file content for a dnsmasq listener. */
export declare function LocalEdgeCore_renderMacosResolverContent(options: LocalEdgeCore_RenderMacosResolverOptions): string;
/** Parses the first nameserver and port directives from macOS resolver content. */
export declare function LocalEdgeCore_parseMacosResolverContent(content: string): LocalEdgeCore_ParsedMacosResolver;
/** Returns unique non-default 127/8 loopback aliases required by method listen hosts. */
export declare function LocalEdgeCore_collectRequiredLoopbackAliases(options: LocalEdgeCore_RequiredLoopbackAliasesOptions): string[];
/** Parses DNS audit argv against adapter-supplied method tokens and defaults. */
export declare function LocalEdgeCore_parseDnsAuditCliArgs(options: {
    readonly args: readonly string[];
    readonly defaultMethod: string;
    readonly defaultStrict: boolean;
    readonly supportedMethods: readonly string[];
}): LocalEdgeCore_DnsAuditParseResult;
/** Builds an empty DNS audit counter state. */
export declare function LocalEdgeCore_createDnsAuditState(): LocalEdgeCore_DnsAuditState;
/** Increments totals and pass count for one DNS audit check. */
export declare function LocalEdgeCore_recordDnsAuditPass(state: LocalEdgeCore_DnsAuditState): void;
/** Increments totals, fail count, and appends a stable failure entry. */
export declare function LocalEdgeCore_recordDnsAuditFailure(options: {
    readonly state: LocalEdgeCore_DnsAuditState;
    readonly label: string;
    readonly detail: string;
}): void;
/** Formats a DNS audit pass line. */
export declare function LocalEdgeCore_formatDnsAuditPassLine(label: string): string;
/** Formats a DNS audit warning line. */
export declare function LocalEdgeCore_formatDnsAuditWarningLine(options: {
    readonly label: string;
    readonly detail: string;
}): string;
/** Formats the final DNS audit summary line. */
export declare function LocalEdgeCore_formatDnsAuditSummaryLine(state: LocalEdgeCore_DnsAuditState): string;
/** Renders the DNS audit artifact body without writing to disk. */
export declare function LocalEdgeCore_renderDnsAuditArtifact(options: LocalEdgeCore_RenderDnsAuditArtifactOptions): string;
//# sourceMappingURL=dns.d.ts.map