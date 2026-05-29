/**
 * @fileoverview Public nginx-docker router export surface for the agnostic local-edge package.
 *
 * This module groups the product-neutral nginx config renderers and Docker lifecycle sequencing
 * helpers that adapter wrappers use to reconcile an HTTPS edge router without importing source-file
 * internals. Host Docker execution and product route catalogs remain adapter-owned.
 * Flow: `./router/nginx-docker` subpath -> re-export `../nginx.js` plus `../docker-lifecycle.js` -> adapters import `LocalEdgeCore_*` helpers for render and argv contracts.
 *
 * @testing Node test (node:test via tsx): cd packages/local-edge-core && npm run test
 *
 * @see packages/local-edge-core/src/nginx.ts - Nginx server-block and docker-compose render helpers re-exported through this barrel so `@gg-utils/local-edge-core/router/nginx-docker` stays the curated HTTPS edge materialization surface.
 * @see packages/local-edge-core/src/docker-lifecycle.ts - Docker argv and ensure-running lifecycle helpers re-exported here beside the nginx surface for nginx-docker adapter orchestration.
 * @see packages/local-edge-core/src/package-exports.unit.test.ts - Subpath export smoke test that imports `@gg-utils/local-edge-core/router/nginx-docker` to prove the public `./router/nginx-docker` export map stays wired to working `LocalEdgeCore_*` symbols.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
export * from "../nginx.js";
export * from "../docker-lifecycle.js";
//# sourceMappingURL=nginx-docker.d.ts.map