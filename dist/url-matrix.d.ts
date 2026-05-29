/**
 * @fileoverview Product-neutral URL-matrix rendering helpers for local-edge adapters.
 *
 * This file owns deterministic HTTPS URL formatting, argv parsing for URL-matrix commands, and
 * labeled matrix line rendering from caller-provided surfaces, hostnames, paths, and bind facts.
 * Product adapters own which surfaces exist and which app/status paths each surface exposes.
 * Flow: parse optional --method/--help -> validate method -> format HTTPS URLs -> emit matrix lines.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/url-matrix.unit.test.ts
 * @testing Node.js test runner (tsx): npm run test --prefix packages/local-edge-core
 *
 * @see packages/local-edge-core/src/hostname.ts - Hostname builder whose dotted names are embedded in each matrix line's HTTPS host segment.
 * @see packages/local-edge-core/src/method-config.ts - Method token validator invoked after argv parsing resolves concrete routing methods beyond primary/all.
 * @see packages/local-edge-kit/src/url-matrix.ts - Kit-level matrix wrapper that maps resolved runtime surfaces into these core line builders for operator output.
 * @see consumer local-edge adapter - consumer adapter binding product surface catalogs to these primitives for shell shim matrix parity.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Parsed method/help options for URL-matrix commands. */
export type LocalEdgeCore_UrlMatrixCliOptions = {
    method: "all" | "primary" | string;
    help: boolean;
};
/** Parses URL-matrix argv without loading env, resolving surfaces, or printing output. */
export declare function LocalEdgeCore_parseUrlMatrixCliArgs(options: {
    args: readonly string[];
    defaultMethod: string;
    supportedMethods: readonly string[];
    commandLabel: string;
}): LocalEdgeCore_UrlMatrixCliOptions;
/** Surface entry consumed by the generic URL matrix renderer. */
export type LocalEdgeCore_UrlMatrixSurface = {
    surface: string;
    appPath: string;
    statusPath: string;
};
/** Formats an HTTPS URL while omitting the explicit port for standard 443. */
export declare function LocalEdgeCore_formatHttpsUrl(options: {
    host: string;
    port: number;
    requestPath: string;
}): string;
/** Builds legacy-compatible URL matrix lines from explicit generic realm and surface facts. */
export declare function LocalEdgeCore_buildUrlMatrixLines(options: {
    method: string;
    listenHost: string;
    port: number;
    developerSlug: string;
    realmSlug: string;
    rootZone: string;
    surfaces: readonly LocalEdgeCore_UrlMatrixSurface[];
}): string[];
//# sourceMappingURL=url-matrix.d.ts.map