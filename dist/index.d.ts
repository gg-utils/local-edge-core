/**
 * @fileoverview Public barrel entrypoint for `@gg-utils/local-edge-core` that re-exports product-agnostic
 * local-edge primitives (TLS, DNS, nginx, manifests, health, and CLI helpers) as one curated surface.
 *
 * Only product-neutral contracts and pure helpers are exported here; consumer adapters may import
 * this package while package code must never import repository-specific modules.
 * Flow: cohesive implementation modules in `packages/local-edge-core/src/` -> star re-exports below -> callers import `@gg-utils/local-edge-core` or documented subpaths from `package.json`.
 *
 * @example
 * ```typescript
 * import { LocalEdgeCore_slugifySegment } from "@gg-utils/local-edge-core";
 *
 * const slug = LocalEdgeCore_slugifySegment(" Example__/Name ");
 * ```
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test
 *
 * @see packages/local-edge-kit/src/command-runtime.ts - Kit command runtime imports concrete core callables from this barrel when wiring argv parsing, health checks, and shared local-edge workflows into platform CLIs.
 * @see docs/LOCAL-EDGE.md - Runbook that explains local-edge realms, manifests, and operator flows that depend on the primitives surfaced through this export map.
 * @see packages/local-edge-core/package.json - Declares the `exports` table pairing each `@gg-utils/local-edge-core/*` subpath with the same TypeScript sources this root barrel aggregates for default imports.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
export * from "./cli.js";
export * from "./config-primitives.js";
export * from "./dns.js";
export * from "./doctor.js";
export * from "./docker-lifecycle.js";
export * from "./hostname.js";
export * from "./healthcheck.js";
export * from "./log-output.js";
export * from "./logs.js";
export * from "./manifest.js";
export * from "./method-config.js";
export * from "./paths.js";
export * from "./prompt.js";
export * from "./registry-json-store.js";
export * from "./registry.js";
export * from "./route-plan.js";
export * from "./runtime-stop.js";
export * from "./shell-shim.js";
export * from "./nginx.js";
export * from "./network.js";
export * from "./status.js";
export * from "./startup-cli.js";
export * from "./system.js";
export * from "./tls.js";
export * from "./url-matrix.js";
export * from "./validation.js";
export * from "./with-logs.js";
//# sourceMappingURL=index.d.ts.map