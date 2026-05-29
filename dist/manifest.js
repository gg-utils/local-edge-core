/**
 * @fileoverview Product-neutral local-edge manifest and adapter-contract types for surfaces,
 * upstreams, artifact/DNS/TLS context, and adapter hook envelopes consumed by `@gg-utils/local-edge-core`.
 *
 * Consumer-specific surfaces, env overlays, runtime processes, and worktree policies are supplied
 * by adapters outside this package; this file only owns the shared shape contracts.
 * Flow: adapter builds `LocalEdgeCore_Manifest` and `LocalEdgeCore_Context` -> core helpers read
 * surfaces, upstreams, and availability without importing repository-specific modules.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/package-exports.unit.test.ts
 * @testing CLI: cd packages/local-edge-core && npm run type-check
 *
 * @see packages/local-edge-core/src/index.ts - Public barrel re-exports this manifest module so kits and CLIs import `@gg-utils/local-edge-core` or `./manifest.js` subpaths without reaching into adapter repos.
 * @see packages/local-edge-core/src/route-plan.ts - Route-planning logic imports `LocalEdgeCore_Manifest` and related surface/upstream types defined here when computing host and URL matrices.
 * @see docs/LOCAL-EDGE.md - Operator runbook for local-edge realms and manifest fields that these neutral contracts are meant to express consistently across adapters.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
export {};
//# sourceMappingURL=manifest.js.map