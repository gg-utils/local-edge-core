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

import path from "node:path";

import { LocalEdgeCore_normalizeSlugOrFallback } from "./config-primitives.js";
import {
  LocalEdgeCore_normalizeLegacyArtifactPath,
  LocalEdgeCore_normalizeMachineRootDir,
} from "./paths.js";
import {
  LocalEdgeCore_buildDockerComposeDownCommand,
  LocalEdgeCore_buildDockerComposeUpDetachedCommand,
} from "./docker-lifecycle.js";

/** Result of resolving an adapter-provided method CSV against a supported-method allowlist. */
export type LocalEdgeCore_ConfiguredMethodsResult =
  | { ok: true; methodsCsv: string }
  | { ok: false; message: string };

/** Result of resolving a primary method against a configured method CSV. */
export type LocalEdgeCore_PrimaryMethodResult =
  | { ok: true; method: string }
  | { ok: false; message: string };

/** Normalizes a local-edge route/config segment with the legacy `default` empty fallback. */
export function LocalEdgeCore_slugifySegment(rawValue: string): string {
  return LocalEdgeCore_normalizeSlugOrFallback({
    value: rawValue,
    fallback: "default",
  });
}

/** Resolves the machine-local generated artifact root from explicit raw env/config values. */
export function LocalEdgeCore_resolveGeneratedDirBase(options: {
  projectRoot: string;
  configuredGeneratedDir: string | undefined;
}): string {
  const defaultParent = path.join(options.projectRoot, ".tmp", "local-edge");
  const configuredDir = options.configuredGeneratedDir ?? defaultParent;
  return LocalEdgeCore_normalizeMachineRootDir(configuredDir);
}

/** Resolves the developer slug using the historical configured-value-over-user precedence. */
export function LocalEdgeCore_resolveDeveloperSlug(options: {
  configuredDeveloperSlug: string | undefined;
  user: string | undefined;
  defaultDeveloperSlug: string;
}): string {
  const raw =
    options.configuredDeveloperSlug !== undefined
      ? options.configuredDeveloperSlug
      : (options.user ?? options.defaultDeveloperSlug);
  return LocalEdgeCore_slugifySegment(raw);
}

/** Resolves the environment slug from explicit raw env/config text. */
export function LocalEdgeCore_resolveEnvSlug(options: {
  configuredEnvSlug: string | undefined;
  defaultEnvSlug: string;
}): string {
  return LocalEdgeCore_slugifySegment(
    options.configuredEnvSlug ?? options.defaultEnvSlug,
  );
}

/** Resolves a generic nginx-docker Docker Compose project name. */
export function LocalEdgeCore_resolveNginxDockerProjectName(options: {
  configuredProjectName: string | undefined;
  configuredDeveloperSlug: string | undefined;
  user: string | undefined;
  configuredEnvSlug: string | undefined;
  projectNamePrefix: string;
  defaultDeveloperSlug: string;
  defaultEnvSlug: string;
}): string {
  const configuredProjectName = options.configuredProjectName ?? "";
  if (configuredProjectName.trim().length > 0) {
    return LocalEdgeCore_slugifySegment(configuredProjectName);
  }

  const developerSlug = LocalEdgeCore_resolveDeveloperSlug({
    configuredDeveloperSlug: options.configuredDeveloperSlug,
    user: options.user,
    defaultDeveloperSlug: options.defaultDeveloperSlug,
  });
  const envSlug = LocalEdgeCore_resolveEnvSlug({
    configuredEnvSlug: options.configuredEnvSlug,
    defaultEnvSlug: options.defaultEnvSlug,
  });

  return LocalEdgeCore_slugifySegment(
    `${options.projectNamePrefix}-${developerSlug}-${envSlug}`,
  );
}

/** Returns whether a method token is present in the explicit supported-method allowlist. */
export function LocalEdgeCore_isSupportedMethod(options: {
  method: string;
  supportedMethods: readonly string[];
}): boolean {
  return options.supportedMethods.includes(options.method);
}

/** Validates a requested method token against explicit supported methods. */
export function LocalEdgeCore_validateRequestedMethod(options: {
  allowAll: boolean;
  commandLabel: string;
  method: string;
  supportedMethods: readonly string[];
}): "all" | string {
  if (options.method.length === 0) {
    throw new Error(`[${options.commandLabel}] --method requires a value.`);
  }

  if (options.allowAll && options.method === "all") {
    return "all";
  }

  if (
    LocalEdgeCore_isSupportedMethod({
      method: options.method,
      supportedMethods: options.supportedMethods,
    })
  ) {
    return options.method;
  }

  throw new Error(
    `[${options.commandLabel}] Unsupported --method '${options.method}'.`,
  );
}

/** Resolves and validates a local-edge method CSV without reading process env. */
export function LocalEdgeCore_resolveConfiguredMethods(options: {
  rawMethodsCsv: string | undefined;
  supportedMethods: readonly string[];
  defaultMethod: string;
  envName: string;
  unsupportedLegacyEnvKeys: readonly string[];
  singleMethodMode: boolean;
}): LocalEdgeCore_ConfiguredMethodsResult {
  if (options.unsupportedLegacyEnvKeys.length > 0) {
    const sorted = [...options.unsupportedLegacyEnvKeys].sort();
    return {
      ok: false,
      message: `Unsupported legacy host-managed local-edge env keys detected. Remove: ${sorted.join(",")}.`,
    };
  }

  const methodsCsv = options.rawMethodsCsv ?? options.defaultMethod;
  const tokens = methodsCsv
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const emitted: string[] = [];
  for (const method of tokens) {
    if (
      !LocalEdgeCore_isSupportedMethod({
        method,
        supportedMethods: options.supportedMethods,
      })
    ) {
      continue;
    }
    if (!emitted.includes(method)) {
      emitted.push(method);
    }
  }

  const resolved = emitted.length > 0 ? emitted : [options.defaultMethod];
  if (options.singleMethodMode && resolved.length !== 1) {
    return {
      ok: false,
      message: `${options.envName} must contain exactly one method in single-method mode. Current value='${methodsCsv}'.`,
    };
  }

  return { ok: true, methodsCsv: resolved.join(",") };
}

/** Resolves and validates a primary method against a configured method result. */
export function LocalEdgeCore_resolvePrimaryMethod(options: {
  rawPrimaryMethod: string | undefined;
  configuredMethodsResult: LocalEdgeCore_ConfiguredMethodsResult;
  supportedMethods: readonly string[];
  defaultMethod: string;
  primaryEnvName: string;
  methodsEnvName: string;
}): LocalEdgeCore_PrimaryMethodResult {
  const configuredPrimary = options.rawPrimaryMethod ?? options.defaultMethod;
  if (configuredPrimary.trim().length === 0) {
    return {
      ok: false,
      message: `${options.primaryEnvName} is required and cannot be empty.`,
    };
  }

  if (
    !LocalEdgeCore_isSupportedMethod({
      method: configuredPrimary,
      supportedMethods: options.supportedMethods,
    })
  ) {
    return {
      ok: false,
      message: `${options.primaryEnvName}='${configuredPrimary}' is unsupported. Allowed value: ${options.supportedMethods.join(", ")}.`,
    };
  }

  const configuredMethodsResult = options.configuredMethodsResult;
  if (!configuredMethodsResult.ok) {
    return { ok: false, message: configuredMethodsResult.message };
  }

  const methodsCsv = configuredMethodsResult.methodsCsv;
  if (`,${methodsCsv},`.includes(`,${configuredPrimary},`)) {
    return { ok: true, method: configuredPrimary };
  }

  return {
    ok: false,
    message: `${options.primaryEnvName}='${configuredPrimary}' is not present in ${options.methodsEnvName}='${methodsCsv}'.`,
  };
}

/** Resolves the nginx-docker listen port using historical `parseInt` semantics. */
export function LocalEdgeCore_resolveNginxDockerPort(options: {
  rawPort: string | undefined;
  defaultPort: number;
}): number {
  return Number.parseInt(options.rawPort ?? String(options.defaultPort), 10);
}

/** Resolves the nginx-docker listen host without trimming to preserve legacy env behavior. */
export function LocalEdgeCore_resolveNginxDockerListenHost(options: {
  rawHost: string | undefined;
  defaultHost: string;
}): string {
  return options.rawHost ?? options.defaultHost;
}

/** Resolves the split-DNS target IP for nginx-docker using explicit override/listen-host fallback. */
export function LocalEdgeCore_resolveNginxDockerSplitDnsIp(options: {
  rawSplitDnsIp: string | undefined;
  rawListenHost: string | undefined;
  defaultIp: string;
}): string {
  return options.rawSplitDnsIp ?? options.rawListenHost ?? options.defaultIp;
}

/** Returns the local-edge env key that controls the nginx-docker listen port. */
export function LocalEdgeCore_nginxDockerPortEnvName(): string {
  return "LOCAL_EDGE_NGINX_DOCKER_PORT";
}

/** Returns the local-edge env key that controls the nginx-docker listen host. */
export function LocalEdgeCore_nginxDockerHostEnvName(): string {
  return "LOCAL_EDGE_NGINX_DOCKER_HOST";
}

/** Returns the required host utility commands for nginx-docker operation. */
export function LocalEdgeCore_nginxDockerRequiredUtilities(): string[] {
  return ["docker"];
}

/** Resolves the default nginx-docker Docker Compose file path under a generated artifact root. */
export function LocalEdgeCore_resolveNginxDockerDefaultComposePath(options: {
  generatedDir: string;
}): string {
  return path.join(
    options.generatedDir,
    "router",
    "nginx-docker",
    "docker-compose.yml",
  );
}

/** Resolves the effective nginx-docker Docker Compose file path with legacy override remapping. */
export function LocalEdgeCore_resolveNginxDockerComposePath(options: {
  generatedDir: string;
  rawConfigPath: string | undefined;
}): string {
  return LocalEdgeCore_normalizeLegacyArtifactPath({
    configuredPath: options.rawConfigPath,
    machineRootDir: options.generatedDir,
    fallbackPath: LocalEdgeCore_resolveNginxDockerDefaultComposePath({
      generatedDir: options.generatedDir,
    }),
  });
}

/** Resolves the effective nginx-docker nginx config file path with legacy override remapping. */
export function LocalEdgeCore_resolveNginxDockerConfigPath(options: {
  generatedDir: string;
  rawNginxConfigPath: string | undefined;
}): string {
  return LocalEdgeCore_normalizeLegacyArtifactPath({
    configuredPath: options.rawNginxConfigPath,
    machineRootDir: options.generatedDir,
    fallbackPath: path.join(
      options.generatedDir,
      "router",
      "nginx-docker",
      "nginx.conf",
    ),
  });
}

/** Resolves the required nginx-docker router artifact paths in historical order. */
export function LocalEdgeCore_resolveNginxDockerRequiredArtifactPaths(options: {
  generatedDir: string;
  rawConfigPath: string | undefined;
  rawNginxConfigPath: string | undefined;
}): string[] {
  return [
    LocalEdgeCore_resolveNginxDockerComposePath({
      generatedDir: options.generatedDir,
      rawConfigPath: options.rawConfigPath,
    }),
    LocalEdgeCore_resolveNginxDockerConfigPath({
      generatedDir: options.generatedDir,
      rawNginxConfigPath: options.rawNginxConfigPath,
    }),
  ];
}

/** Resolves the nginx-docker start command from an optional override or generic compose defaults. */
export function LocalEdgeCore_resolveNginxDockerStartCommand(options: {
  rawStartCommand: string | undefined;
  projectName: string;
  composePath: string;
}): string {
  const customCommand = options.rawStartCommand ?? "";
  if (customCommand.trim().length > 0) {
    return customCommand;
  }
  return LocalEdgeCore_buildDockerComposeUpDetachedCommand({
    projectName: options.projectName,
    composePath: options.composePath,
  });
}

/** Resolves the nginx-docker stop command from an optional override or generic compose defaults. */
export function LocalEdgeCore_resolveNginxDockerStopCommand(options: {
  rawStopCommand: string | undefined;
  projectName: string;
  composePath: string;
}): string {
  const customCommand = options.rawStopCommand ?? "";
  if (customCommand.trim().length > 0) {
    return customCommand;
  }
  return LocalEdgeCore_buildDockerComposeDownCommand({
    projectName: options.projectName,
    composePath: options.composePath,
  });
}
