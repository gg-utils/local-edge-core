/**
 * @fileoverview Manifest-driven route planning for neutral local-edge realms.
 *
 * This module converts adapter-provided manifests and neutral realm records into deterministic
 * routing plans. It does not render nginx, write files, start processes, or know product-specific
 * surface catalogs.
 * Flow: validate realm record -> map manifest surfaces -> assert upstream ids on manifest and realm -> materialize hostnames and paths per surface.
 *
 * @testing CLI: cd packages/local-edge-core && npm run test -- src/route-plan.unit.test.ts
 *
 * @see packages/local-edge-core/src/manifest.ts - Canonical manifest, surface, and upstream id contracts this planner reads when expanding each surface into hostname, path, and availability fields.
 * @see packages/local-edge-core/src/registry.ts - Realm record validation plus upstream matrix lookups this module depends on before binding each surface to runtime upstream targets.
 * @see packages/local-edge-core/src/hostname.ts - Hostname assembly helper invoked for every planned surface when combining realm method, slug, root zone, and each manifest host label.
 * @see packages/local-edge-core/src/route-plan.unit.test.ts - Node test runner module that asserts hostname wiring, upstream resolution, and validation errors for the route-plan behavior owned here.
 * @see consumer local-edge adapter - Cross-package Jest regression that exercises LocalEdgeCore_buildManifestRoutePlan through the published @gg-utils/local-edge-core entrypoint with consumer adapter manifests.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { LocalEdgeCore_buildHostnameFromParts } from "./hostname.js";
import {
  LocalEdgeCore_validateRealmRecord,
  type LocalEdgeCore_RealmRecord,
  type LocalEdgeCore_RealmUpstream,
} from "./registry.js";
import type {
  LocalEdgeCore_Manifest,
  LocalEdgeCore_Surface,
  LocalEdgeCore_SurfaceAvailability,
} from "./manifest.js";

/** Single route entry resolved from one manifest surface and one realm. */
export type LocalEdgeCore_RoutePlanSurface = {
  surfaceId: string;
  hostLabel: string;
  hostname: string;
  upstreamId: string;
  upstream: LocalEdgeCore_RealmUpstream;
  routeGroupId: string;
  appPath: string;
  statusPath: string;
  availability: LocalEdgeCore_SurfaceAvailability;
};

/** Per-realm manifest route plan used by package renderers and adapter canaries. */
export type LocalEdgeCore_RoutePlan = {
  realmSlug: string;
  method: string;
  surfaces: readonly LocalEdgeCore_RoutePlanSurface[];
};

/** Options for converting one manifest plus one neutral realm into a route plan. */
export type LocalEdgeCore_BuildManifestRoutePlanOptions = {
  manifest: LocalEdgeCore_Manifest;
  realmRecord: LocalEdgeCore_RealmRecord;
};

/** Validates that a manifest surface references a declared upstream id. */
function LocalEdgeCore_assertManifestUpstreamExists(options: {
  manifest: LocalEdgeCore_Manifest;
  surface: LocalEdgeCore_Surface;
}): void {
  const exists = options.manifest.upstreams.some(
    (upstream) => upstream.id === options.surface.upstreamId,
  );
  if (!exists) {
    throw new Error(
      `[local-edge-core:route-plan] surface '${options.surface.id}' references ` +
        `unknown manifest upstream '${options.surface.upstreamId}'.`,
    );
  }
}

/** Resolves the runtime upstream for a surface from the neutral realm record. */
function LocalEdgeCore_resolveRoutePlanUpstream(options: {
  realmRecord: LocalEdgeCore_RealmRecord;
  surface: LocalEdgeCore_Surface;
}): LocalEdgeCore_RealmUpstream {
  const upstream = options.realmRecord.upstreams[options.surface.upstreamId];
  if (!upstream) {
    throw new Error(
      `[local-edge-core:route-plan] realm '${options.realmRecord.realmSlug}' missing ` +
        `upstream '${options.surface.upstreamId}' for surface '${options.surface.id}'.`,
    );
  }
  return upstream;
}

/** Converts a product-neutral manifest and realm record into a deterministic route plan. */
export function LocalEdgeCore_buildManifestRoutePlan(
  options: LocalEdgeCore_BuildManifestRoutePlanOptions,
): LocalEdgeCore_RoutePlan {
  const realmRecord = LocalEdgeCore_validateRealmRecord(options.realmRecord);
  const surfaces = options.manifest.surfaces.map((surface): LocalEdgeCore_RoutePlanSurface => {
    LocalEdgeCore_assertManifestUpstreamExists({
      manifest: options.manifest,
      surface,
    });
    return {
      surfaceId: surface.id,
      hostLabel: surface.hostLabel,
      hostname: LocalEdgeCore_buildHostnameFromParts({
        surface: surface.hostLabel,
        realmSlug: realmRecord.realmSlug,
        method: realmRecord.method,
        developerSlug: realmRecord.hostnameParts.developerSlug,
        rootZone: realmRecord.hostnameParts.rootZone,
      }),
      upstreamId: surface.upstreamId,
      upstream: LocalEdgeCore_resolveRoutePlanUpstream({ realmRecord, surface }),
      routeGroupId: surface.routeGroupId,
      appPath: surface.appPath,
      statusPath: surface.statusPath,
      availability: surface.availability,
    };
  });

  return {
    realmSlug: realmRecord.realmSlug,
    method: realmRecord.method,
    surfaces,
  };
}
