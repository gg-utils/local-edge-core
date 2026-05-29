/**
 * @fileoverview Generic nginx server-block rendering primitives for local-edge route adapters.
 *
 * The functions here render product-neutral reverse-proxy snippets from explicit caller-provided
 * data. Package core does not decide surface catalogs, grouping, ports, TLS paths, DNS resolver
 * strategy, or product-specific timeout commentary.
 *
 * @testing Jest unit: cd packages/local-edge-core && npm run test -- src/nginx.unit.test.ts
 * @see packages/local-edge-core/src/router/nginx-docker.ts - Nginx-docker router entry that re-exports these render helpers so adapters can materialize nginx.conf and Docker Compose from resolved surface options.
 * @see packages/local-edge-core/src/nginx.unit.test.ts - Jest regression coverage for server blocks, http wrapper output, and compose snippets produced by the render functions in this module.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Canonical file-overview contract defining @testing, @see, and @documentation ordering and review metadata enforced for this header.
 * @documentation reviewed=2026-05-23 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** TLS certificate/key paths rendered into an nginx server block. */
export type LocalEdgeCore_NginxTlsPaths = {
    certPath: string;
    keyPath: string;
};
/** One nginx reverse-proxy server block resolved by an adapter. */
export type LocalEdgeCore_NginxServerBlockOptions = {
    method: string;
    listenHost: string;
    listenPort: number;
    serverNames: readonly string[];
    tls: LocalEdgeCore_NginxTlsPaths;
    surfaceHeader: string;
    upstreamHost: string;
    upstreamPort: number;
    variableName: string;
    websocketSafe: boolean;
    routerHealthPath: string;
    routerHealthBody: string;
};
/** Docker resolver settings rendered into an nginx `http` block. */
export type LocalEdgeCore_NginxDockerResolverOptions = {
    resolverAddress: string;
    ipv6Mode: "on" | "off";
    validSeconds: number;
    timeoutSeconds: number;
};
/** Generic nginx `http` wrapper settings around adapter-supplied server blocks. */
export type LocalEdgeCore_NginxHttpConfigOptions = {
    generatedBy: string;
    mimeTypesPath: string;
    workerProcesses: number;
    workerConnections: number;
    keepaliveTimeoutSeconds: number;
    serverNamesHashBucketSize: number;
    variablesHashBucketSize: number;
    variablesHashMaxSize: number;
    clientBodyTimeoutSeconds: number;
    clientMaxBodySize: string;
    proxyConnectTimeoutSeconds: number;
    proxyReadTimeoutSeconds: number;
    proxySendTimeoutSeconds: number;
    sendTimeoutSeconds: number;
    timeoutCommentLines: readonly string[];
    dockerResolver: LocalEdgeCore_NginxDockerResolverOptions | null;
    serverBlocks: readonly string[];
};
/** One Docker Compose port binding for a generated router service. */
export type LocalEdgeCore_DockerComposePortBinding = {
    host: string;
    hostPort: number;
    containerPort: number;
};
/** One Docker Compose volume mount for a generated router service. */
export type LocalEdgeCore_DockerComposeVolumeMount = {
    sourcePath: string;
    targetPath: string;
    readOnly: boolean;
};
/** Generic Docker Compose service settings for an nginx-docker local-edge router. */
export type LocalEdgeCore_NginxDockerComposeOptions = {
    projectName: string;
    serviceName: string;
    image: string;
    restartPolicy: string;
    portBindings: readonly LocalEdgeCore_DockerComposePortBinding[];
    labels: readonly string[];
    volumeMounts: readonly LocalEdgeCore_DockerComposeVolumeMount[];
};
/** Builds the `set` plus `proxy_pass` snippet for a stable upstream variable. */
export declare function LocalEdgeCore_renderNginxProxyPassDirective(options: {
    upstreamHost: string;
    upstreamPort: number;
    variableName: string;
}): string;
/** Emits forwarding headers tagging the ingress method and adapter-provided surface label. */
export declare function LocalEdgeCore_renderNginxProxyHeaderDirectives(options: {
    method: string;
    surfaceHeader: string;
}): string;
/** Emits websocket upgrade headers and extended read timeout for websocket-safe surfaces. */
export declare function LocalEdgeCore_renderNginxWebsocketProxyDirectives(): string;
/** Renders one nginx `server` block for an adapter-resolved local-edge surface/group. */
export declare function LocalEdgeCore_renderNginxServerBlock(options: LocalEdgeCore_NginxServerBlockOptions): string;
/** Renders a complete nginx config from generic wrapper settings and server blocks. */
export declare function LocalEdgeCore_renderNginxHttpConfig(options: LocalEdgeCore_NginxHttpConfigOptions): string;
/** Renders a generic Docker Compose file for one nginx-docker router service. */
export declare function LocalEdgeCore_renderNginxDockerCompose(options: LocalEdgeCore_NginxDockerComposeOptions): string;
//# sourceMappingURL=nginx.d.ts.map