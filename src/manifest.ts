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

/** Availability contract for required, optional, or disabled local-edge surfaces. */
export type LocalEdgeCore_SurfaceAvailability =
  | { state: "local-edge-surface-availability-required" }
  | {
      state: "local-edge-surface-availability-optional";
      expectedAbsentStatuses: readonly number[];
    }
  | { state: "local-edge-surface-availability-disabled"; reason: string };

/** Product-neutral surface definition supplied by an adapter manifest. */
export type LocalEdgeCore_Surface = {
  id: string;
  hostLabel: string;
  upstreamId: string;
  routeGroupId: string;
  appPath: string;
  statusPath: string;
  availability: LocalEdgeCore_SurfaceAvailability;
};

/** Product-neutral upstream endpoint definition for router targets. */
export type LocalEdgeCore_Upstream = {
  id: string;
  host: string;
  port: number;
  protocol: "http" | "https";
};

/** Filesystem locations used by core artifact writers and adapters. */
export type LocalEdgeCore_ArtifactConfig = {
  rootDir: string;
  generatedDir: string;
  realmDir?: string;
  envDir?: string;
  logDir?: string;
};

/** DNS settings required to render or plan local-edge host routing. */
export type LocalEdgeCore_DnsConfig = {
  rootZone: string;
  resolverZone: string;
  dnsmasqConfigPath?: string;
  resolverPath?: string;
  loopbackAddresses: readonly string[];
};

/** TLS material and trust-store policy for a local-edge realm. */
export type LocalEdgeCore_TlsConfig = {
  mode: "mkcert" | "self-signed" | "provided";
  certificatePath: string;
  keyPath: string;
  subjectAlternativeNames: readonly string[];
  trustStoreMutationAllowed: boolean;
};

/** Runtime-neutral context passed from adapters into package-core operations. */
export type LocalEdgeCore_Context = {
  projectRoot: string;
  workspaceKind:
    | "canonical-root-workspace"
    | "prepared-worktree"
    | "external-consumer";
  realmSlug: string;
  method: string;
  artifacts: LocalEdgeCore_ArtifactConfig;
  dns: LocalEdgeCore_DnsConfig;
  tls: LocalEdgeCore_TlsConfig;
};

/** Top-level package-core manifest consumed by generic render and CLI commands. */
export type LocalEdgeCore_Manifest = {
  schemaVersion: 1;
  packageName: string;
  methods: readonly string[];
  surfaces: readonly LocalEdgeCore_Surface[];
  upstreams: readonly LocalEdgeCore_Upstream[];
};

/** Standard success/error envelope for adapter hooks called by package core. */
export type LocalEdgeCore_AdapterHookResult<T> =
  | { ok: true; value: T; warnings: readonly string[] }
  | { ok: false; errorCode: string; message: string; recoveryHint?: string };
