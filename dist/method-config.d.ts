/**
 * @fileoverview Product-neutral method configuration resolvers for local-edge adapters.
 *
 * The helpers in this file encode reusable local-edge method/env conventions such as generated
 * artifact roots, method CSV normalization, nginx-docker bind defaults, and Docker Compose project
 * naming. They accept explicit raw values instead of reading `process.env`, so project adapters
 * remain responsible for env source precedence and product-specific validation.
 *
 * @testing Node.js test runner (tsx): cd packages/local-edge-core && node ../../node_modules/tsx/dist/cli.mjs --test src/method-config.unit.test.ts
 *
 * @see packages/local-edge-core/src/cli.ts - Render-style CLI argv parser that imports LocalEdgeCore_validateRequestedMethod from this module to enforce supported `--method` tokens against adapter allowlists.
 * @see packages/local-edge-core/src/docker-lifecycle.ts - Docker Compose command builders invoked when nginx-docker start/stop resolvers here return the default detached up/down shells instead of custom override commands.
 * @see packages/local-edge-core/src/config-primitives.ts - Slug normalization helper this module calls for route segments, developer/env slugs, and derived Docker Compose project names.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Result of resolving an adapter-provided method CSV against a supported-method allowlist. */
export type LocalEdgeCore_ConfiguredMethodsResult = {
    ok: true;
    methodsCsv: string;
} | {
    ok: false;
    message: string;
};
/** Result of resolving a primary method against a configured method CSV. */
export type LocalEdgeCore_PrimaryMethodResult = {
    ok: true;
    method: string;
} | {
    ok: false;
    message: string;
};
/** Normalizes a local-edge route/config segment with the legacy `default` empty fallback. */
export declare function LocalEdgeCore_slugifySegment(rawValue: string): string;
/** Resolves the machine-local generated artifact root from explicit raw env/config values. */
export declare function LocalEdgeCore_resolveGeneratedDirBase(options: {
    projectRoot: string;
    configuredGeneratedDir: string | undefined;
}): string;
/** Resolves the developer slug using the historical configured-value-over-user precedence. */
export declare function LocalEdgeCore_resolveDeveloperSlug(options: {
    configuredDeveloperSlug: string | undefined;
    user: string | undefined;
    defaultDeveloperSlug: string;
}): string;
/** Resolves the environment slug from explicit raw env/config text. */
export declare function LocalEdgeCore_resolveEnvSlug(options: {
    configuredEnvSlug: string | undefined;
    defaultEnvSlug: string;
}): string;
/** Resolves a generic nginx-docker Docker Compose project name. */
export declare function LocalEdgeCore_resolveNginxDockerProjectName(options: {
    configuredProjectName: string | undefined;
    configuredDeveloperSlug: string | undefined;
    user: string | undefined;
    configuredEnvSlug: string | undefined;
    projectNamePrefix: string;
    defaultDeveloperSlug: string;
    defaultEnvSlug: string;
}): string;
/** Returns whether a method token is present in the explicit supported-method allowlist. */
export declare function LocalEdgeCore_isSupportedMethod(options: {
    method: string;
    supportedMethods: readonly string[];
}): boolean;
/** Validates a requested method token against explicit supported methods. */
export declare function LocalEdgeCore_validateRequestedMethod(options: {
    allowAll: boolean;
    commandLabel: string;
    method: string;
    supportedMethods: readonly string[];
}): "all" | string;
/** Resolves and validates a local-edge method CSV without reading process env. */
export declare function LocalEdgeCore_resolveConfiguredMethods(options: {
    rawMethodsCsv: string | undefined;
    supportedMethods: readonly string[];
    defaultMethod: string;
    envName: string;
    unsupportedLegacyEnvKeys: readonly string[];
    singleMethodMode: boolean;
}): LocalEdgeCore_ConfiguredMethodsResult;
/** Resolves and validates a primary method against a configured method result. */
export declare function LocalEdgeCore_resolvePrimaryMethod(options: {
    rawPrimaryMethod: string | undefined;
    configuredMethodsResult: LocalEdgeCore_ConfiguredMethodsResult;
    supportedMethods: readonly string[];
    defaultMethod: string;
    primaryEnvName: string;
    methodsEnvName: string;
}): LocalEdgeCore_PrimaryMethodResult;
/** Resolves the nginx-docker listen port using historical `parseInt` semantics. */
export declare function LocalEdgeCore_resolveNginxDockerPort(options: {
    rawPort: string | undefined;
    defaultPort: number;
}): number;
/** Resolves the nginx-docker listen host without trimming to preserve legacy env behavior. */
export declare function LocalEdgeCore_resolveNginxDockerListenHost(options: {
    rawHost: string | undefined;
    defaultHost: string;
}): string;
/** Resolves the split-DNS target IP for nginx-docker using explicit override/listen-host fallback. */
export declare function LocalEdgeCore_resolveNginxDockerSplitDnsIp(options: {
    rawSplitDnsIp: string | undefined;
    rawListenHost: string | undefined;
    defaultIp: string;
}): string;
/** Returns the local-edge env key that controls the nginx-docker listen port. */
export declare function LocalEdgeCore_nginxDockerPortEnvName(): string;
/** Returns the local-edge env key that controls the nginx-docker listen host. */
export declare function LocalEdgeCore_nginxDockerHostEnvName(): string;
/** Returns the required host utility commands for nginx-docker operation. */
export declare function LocalEdgeCore_nginxDockerRequiredUtilities(): string[];
/** Resolves the default nginx-docker Docker Compose file path under a generated artifact root. */
export declare function LocalEdgeCore_resolveNginxDockerDefaultComposePath(options: {
    generatedDir: string;
}): string;
/** Resolves the effective nginx-docker Docker Compose file path with legacy override remapping. */
export declare function LocalEdgeCore_resolveNginxDockerComposePath(options: {
    generatedDir: string;
    rawConfigPath: string | undefined;
}): string;
/** Resolves the effective nginx-docker nginx config file path with legacy override remapping. */
export declare function LocalEdgeCore_resolveNginxDockerConfigPath(options: {
    generatedDir: string;
    rawNginxConfigPath: string | undefined;
}): string;
/** Resolves the required nginx-docker router artifact paths in historical order. */
export declare function LocalEdgeCore_resolveNginxDockerRequiredArtifactPaths(options: {
    generatedDir: string;
    rawConfigPath: string | undefined;
    rawNginxConfigPath: string | undefined;
}): string[];
/** Resolves the nginx-docker start command from an optional override or generic compose defaults. */
export declare function LocalEdgeCore_resolveNginxDockerStartCommand(options: {
    rawStartCommand: string | undefined;
    projectName: string;
    composePath: string;
}): string;
/** Resolves the nginx-docker stop command from an optional override or generic compose defaults. */
export declare function LocalEdgeCore_resolveNginxDockerStopCommand(options: {
    rawStopCommand: string | undefined;
    projectName: string;
    composePath: string;
}): string;
//# sourceMappingURL=method-config.d.ts.map