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

import { LocalEdgeCore_buildHostnameFromParts } from "./hostname.js";
import { LocalEdgeCore_validateRequestedMethod } from "./method-config.js";

/** Parsed method/help options for URL-matrix commands. */
export type LocalEdgeCore_UrlMatrixCliOptions = {
  method: "all" | "primary" | string;
  help: boolean;
};

/** Parses URL-matrix argv without loading env, resolving surfaces, or printing output. */
export function LocalEdgeCore_parseUrlMatrixCliArgs(options: {
  args: readonly string[];
  defaultMethod: string;
  supportedMethods: readonly string[];
  commandLabel: string;
}): LocalEdgeCore_UrlMatrixCliOptions {
  let requestedMethod = options.defaultMethod;

  for (let index = 0; index < options.args.length; index += 1) {
    const argument = options.args[index];

    if (argument === "--method") {
      const value = options.args[index + 1] ?? "";
      if (value.length === 0) {
        throw new Error(`[${options.commandLabel}] Missing value for --method`);
      }
      requestedMethod = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--method=")) {
      requestedMethod = argument.slice("--method=".length);
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      return { method: requestedMethod, help: true };
    }

    throw new Error(`[${options.commandLabel}] Unknown option: ${argument}`);
  }

  if (requestedMethod === "primary" || requestedMethod === "all") {
    return { method: requestedMethod, help: false };
  }

  return {
    method: LocalEdgeCore_validateRequestedMethod({
      allowAll: false,
      commandLabel: options.commandLabel,
      method: requestedMethod,
      supportedMethods: options.supportedMethods,
    }),
    help: false,
  };
}

/** Surface entry consumed by the generic URL matrix renderer. */
export type LocalEdgeCore_UrlMatrixSurface = {
  surface: string;
  appPath: string;
  statusPath: string;
};

/** Formats an HTTPS URL while omitting the explicit port for standard 443. */
export function LocalEdgeCore_formatHttpsUrl(options: {
  host: string;
  port: number;
  requestPath: string;
}): string {
  const requestPath = options.requestPath.startsWith("/")
    ? options.requestPath
    : `/${options.requestPath}`;
  if (options.port === 443) {
    return `https://${options.host}${requestPath}`;
  }
  return `https://${options.host}:${String(options.port)}${requestPath}`;
}

/** Builds legacy-compatible URL matrix lines from explicit generic realm and surface facts. */
export function LocalEdgeCore_buildUrlMatrixLines(options: {
  method: string;
  listenHost: string;
  port: number;
  developerSlug: string;
  realmSlug: string;
  rootZone: string;
  surfaces: readonly LocalEdgeCore_UrlMatrixSurface[];
}): string[] {
  const lines: string[] = [
    `[local-edge:${options.method}] URL matrix (background-ready, bind=${options.listenHost}:${String(options.port)}):`,
  ];

  for (const surface of options.surfaces) {
    const host = LocalEdgeCore_buildHostnameFromParts({
      surface: surface.surface,
      method: options.method,
      developerSlug: options.developerSlug,
      realmSlug: options.realmSlug,
      rootZone: options.rootZone,
    });
    lines.push(
      `[local-edge:${options.method}] app=${surface.surface} ${LocalEdgeCore_formatHttpsUrl(
        {
          host,
          port: options.port,
          requestPath: surface.appPath,
        },
      )}`,
    );
    lines.push(
      `[local-edge:${options.method}] status=${surface.surface} ${LocalEdgeCore_formatHttpsUrl(
        {
          host,
          port: options.port,
          requestPath: surface.statusPath,
        },
      )}`,
    );
  }

  return lines;
}
