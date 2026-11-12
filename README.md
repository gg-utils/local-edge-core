# @gg-utils/local-edge-core

Agnostic local-edge primitives for local HTTPS routing, route manifests, hostnames, DNS/TLS
planning, registry storage, health checks, log commands, and lifecycle helper logic.

This package is the pure core layer. It does not know about a consumer application's routes, package
names, environment variable policy, worktree behavior, or process manager. Those details belong in a
config adapter or in `@gg-utils/local-edge-kit`.

## Install

```bash
npm install @gg-utils/local-edge-core@git+https://github.com/gg-utils/local-edge-core.git#main
```

Pinned dependency example:

```json
{
  "dependencies": {
    "@gg-utils/local-edge-core": "git+https://github.com/gg-utils/local-edge-core.git#9b91ed7"
  }
}
```

## When To Use

- You need neutral route-manifest, realm-registry, hostname, or URL-matrix helpers.
- You need nginx server-block rendering primitives for local reverse proxying.
- You need DNS, TLS, network listener, status, healthcheck, or runtime-stop helper logic.
- You are building a project-specific local-edge CLI and want pure helpers underneath it.

Skip this package when you need a fully wired CLI around a project config; use
`@gg-utils/local-edge-kit` for that layer.

## Public Surfaces

| Import | Purpose |
|---|---|
| `@gg-utils/local-edge-core/manifest` | Manifest contracts and route grouping. |
| `@gg-utils/local-edge-core/registry` | Realm registry contracts. |
| `@gg-utils/local-edge-core/registry-json-store` | JSON store helpers with locking and atomic writes. |
| `@gg-utils/local-edge-core/hostname` | Hostname and slug helpers. |
| `@gg-utils/local-edge-core/route-plan` | Manifest-driven route planning. |
| `@gg-utils/local-edge-core/nginx` | Nginx rendering primitives. |
| `@gg-utils/local-edge-core/tls` | mkcert and certificate planning helpers. |
| `@gg-utils/local-edge-core/network` | Listener, loopback, and probe helpers. |
| `@gg-utils/local-edge-core/healthcheck` | Healthcheck argv, probe, and summary helpers. |
| `@gg-utils/local-edge-core/cli` | CLI parsing and dry-run output helpers. |
| `@gg-utils/local-edge-core/exposure` | Switchable exposure backends: `tailscale-serve-ports` (default, alias `ports`), plan-only `hostnames` and `tailscale-services`. |

## Quick Start

```ts
import {
  type LocalEdgeCore_Manifest,
  type LocalEdgeCore_RealmRecord,
  LocalEdgeCore_buildManifestRoutePlan,
  LocalEdgeCore_slugifySegment,
} from "@gg-utils/local-edge-core";

declare const manifest: LocalEdgeCore_Manifest;
declare const registryRecord: LocalEdgeCore_RealmRecord;

const realm = LocalEdgeCore_slugifySegment("Feature Branch");
const routePlan = LocalEdgeCore_buildManifestRoutePlan({
  manifest,
  registryRecord,
});

console.log({ realm, routes: routePlan.surfaces.length });
```

## Operational Flow

```mermaid
flowchart TD
    A[Adapter supplies project config] --> B[Core validates hostnames, ports, and paths]
    B --> C[Build neutral local-edge manifest]
    C --> D[Read or write realm registry]
    D --> E[Plan routes and nginx blocks]
    E --> F[Adapter executes host mutations]
    F --> G[Core probes status, DNS, TLS, and health]
```

## Exposure Backends

An exposure backend makes loopback apps reachable at an edge URL. Pick one by name with
`LocalEdgeCore_createExposureBackend(name)`; each has `plan`, `planRemove`, `apply`, `remove`
and `status`.

| Backend | Needs | What it does |
|---|---|---|
| `tailscale-serve-ports` (default, alias `ports`) | nothing | One tailnet-only HTTPS port per app: `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`. |
| `hostnames` (alias `wildcard-dns-nginx`) | DNS and TLS owner | Plan only. Hosts are `<app>.<projectMachineLabel>.<rootZone>` (main realm) or `<app>--<realm>.<projectMachineLabel>.<rootZone>`, routed by SNI on one loopback nginx port. `apply` refuses. |
| `tailscale-services` | tailnet admin | Plan only: one `svc:<name>` per app. `apply` refuses. |

The `hostnames` plan has these steps. One wildcard, `*.<projectMachineLabel>.<rootZone>`, covers
every app and realm, so there is one DNS record and one certificate. The name pattern is a
template (`{label}`, `{app}`, `{realm}`, `{projectMachine}`, `{rootZone}`) or a function in config;
every label is checked (lowercase `a-z0-9-`, at most 63 characters, no `--` at positions 3-4)
and every host must sit directly under the wildcard; whole names may be at most 253 characters.
Realm slugs come from branch names and are cut with a short hash when a label would pass 63
characters. A two-character app name works in the main realm, but in other realms `ab--<realm>`
would put `--` at positions 3-4, so it is refused with `local-edge-core-hostname-short-app`; give
such an app an `edgeName` of 1 or 3+ characters, or its own `hostnameTemplate`.

Every path written into `nginx.conf` (pid, logs, `include`, temp, certificate and key) goes through
one check, `LocalEdgeCore_nginxPathProblem`: it must be absolute and contain no whitespace, quotes,
`;`, `{`, `}`, `#`, `$`, `\` or control characters. Nothing is quoted or escaped, so an unsafe path
is refused, never rewritten. `edgePort`, the client port the Serve TCP step maps, must be a valid
port outside `protectedPorts`.

- One nginx server block per enabled app on `127.0.0.1:<routerPort>`, `server_name` set to its
  host. `LocalEdgeCore_renderExposureHostnamesNginxConfig` renders the whole `nginx.conf`, with
  pid, log and temp paths and the certificate from config, and a default server that answers 421.
  `listeners` makes the router listen on several loopback ports; each gets the 421 default and
  every host block, and `clientPort` sets the port written into `X-Forwarded-Host` and
  `X-Forwarded-Port` for requests on that listener (maps on `$server_port` when they differ).
- An optional SNI stream router (`stream`): a loopback `ssl_preread` listener in the same nginx that
  sends matching names (for example `LocalEdgeCore_sniZoneSuffixPattern(rootZone)`) to a router
  listener and anything else to a default upstream, without terminating TLS. Pointing a tailnet
  port at it is an owner step the backend never applies.
- An app may set its own `hostnameTemplate` to sit under another label; list that wildcard in
  `extraWildcardTemplates` and the certificate and DNS steps cover it too.
- An app may set an exact `host` instead (it must still sit under a configured wildcard), and
  `proxy` overrides for `/`: `upstreamHost` (the `Host` header sent upstream, for dev servers that
  refuse unknown hosts; a DNS name, an IPv4 address or a bracketed IPv6 literal, with an optional port from 1 to 65535, at most 259 characters), `buffering: false` (`proxy_buffering off`, for streams) and `readTimeout` (an nginx time such as `3600s`).
  Extra `locations` take the same three fields, and an empty `upstreamPath` passes the request
  URI through unchanged.
- The provided certificate and key, with a check that their folder is 0700 and outside git.
- lego DNS-01: the install step (listed, never run), `lego run` for the wildcard with the DNS
  provider's env variable names only (`vercel`: `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`), and the
  renewal step (the same `lego run`, which renews only near expiry).
- The wildcard `A`/`AAAA` records, from config or `tailscale status --json`; a noop when the
  config says the owner reports them live.
- A raw-TCP Serve mapping of the router port: `tailscale serve --bg --tcp=<port> tcp://127.0.0.1:<port>`.
  `status` reads `serve status --json` and reports each app `exposed` when that port forwards to
  the router, `missing` when it is unmapped and `conflict` when it is mapped to anything else.

Nothing in the plan is run: the backend issues no certificates, edits no DNS, starts no nginx and
changes no Serve mapping. It refuses a protected or non-loopback router port.

Guards in `tailscale-serve-ports`:

- `apply` is a dry run unless called with `{ apply: true }`.
- Ports in `protectedPorts` are refused for both expose and remove.
- A port with Funnel on, a TCP forward or more than one handler is never changed.
- A port mapped to a different target is refused unless the app sets `replaceExistingMapping`.
- Turn-off (`tailscale serve --https=<port> off`) runs only when the port's single handler is the
  app's own loopback target.
- Any refusal in a plan means nothing in that plan is applied.
- Targets are always `http://127.0.0.1:<port>`; the backend never binds to a tailnet address and
  never runs `serve reset` or Funnel.

The hostname comes from the manifest, or from `tailscale status --json` (`Self.DNSName`). All host
commands go through an injectable runner, so tests never call `tailscale`.

## CLI

The package exposes a `local-edge` bin for core-level command helpers:

```bash
npx @gg-utils/local-edge-core@git+https://github.com/gg-utils/local-edge-core.git#main local-edge --help
```

Project CLIs usually wrap this core surface through `@gg-utils/local-edge-kit` so app-specific
config, prompts, and process execution remain outside the core.

## Development

```bash
git clone https://github.com/gg-utils/local-edge-core.git
cd local-edge-core
npm run type-check
npm test
npm run build
npm run pack:dry-run
```

The extracted scripts currently expect the source-first workspace toolchain.

## Layout

```text
.
|-- bin/local-edge.js
|-- src/manifest.ts
|-- src/registry.ts
|-- src/hostname.ts
|-- src/route-plan.ts
|-- src/nginx.ts
|-- src/tls.ts
|-- src/network.ts
|-- src/healthcheck.ts
|-- dist/
`-- package.json
```

## Caveats

- Host mutations are planned through neutral helpers; adapters perform actual privileged actions.
- Keep project route catalogs, root zones, env defaults, and process commands outside this package.
- Some exports target source-first consumption through TypeScript source paths.

## Use from another repository

Requires Node `>=22.0.0 <27`. Add this dependency; built JavaScript and declarations are included, with no install build step:

```json
"@gg-utils/local-edge-core": "git+https://github.com/gg-utils/local-edge-core.git#v0.4.0"
```
