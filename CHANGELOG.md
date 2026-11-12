# Changelog

## Unreleased

### Added

- **Exact hosts for name-based backends.** An app may set `host`, which wins over every pattern and the edge name. It must still sit directly under a configured wildcard, and duplicate hosts are refused by name. `LocalEdgeCore_exposureAppHost(settings, app)` returns the host an app gets.
- **Per-location proxy options** (`LocalEdgeCore_ExposureProxyOptions`). `proxy` on an app applies to `/`, and every extra location takes the same fields. Output for apps that set none of them is unchanged.
  - `upstreamHost` replaces the `Host` header sent upstream, for dev servers that refuse unknown hosts. It is a DNS name, a dotted-quad IPv4 address or a bracketed IPv6 literal, with an optional port from 1 to 65535, and at most 259 characters (`LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH`). Longer values, empty or leading/trailing-dot labels, labels over 63 characters, out-of-range IPv4 parts and ports outside 1-65535 are refused before rendering.
  - `buffering: false` renders `proxy_buffering off`, for event streams. It must be a boolean.
  - `readTimeout` sets `proxy_read_timeout` (an nginx time such as `3600s`, at most 9 characters). The default stays `300s`.
- **Shared value check.** `LocalEdgeCore_nginxValueProblem` and `LocalEdgeCore_nginxValueArgument` check the exact `host`, `upstreamHost` and `readTimeout` for length, characters nginx reads as syntax, and shape. Validation reports the problem, and render throws `local-edge-core-nginx-unsafe-value`.

### Changed

- An empty `upstreamPath` on an extra location is now accepted (it was refused before) and passes the request URI through unchanged (`proxy_pass http://127.0.0.1:<port>;` with no URI part).
- `LocalEdgeCore_resolveTailnetSuffix` now falls back to the reserved placeholder `tailnet.example`, exported as `LOCAL_EDGE_CORE_FALLBACK_TAILNET_SUFFIX`, instead of a hard-coded tailnet name. The return type is unchanged; pass a suffix or rely on detection to get a working value.
- Test fixtures use reserved documentation names only.

## 0.3.0

### Added

- **Switchable exposure backends** (`./exposure`, `./exposure-contract`, `./exposure-tailscale-serve`, `./exposure-plan-only`). Changing the backend is a config change.
  - `tailscale-serve-ports` (the default) gives each app one tailnet-only HTTPS port. It reads state from `tailscale serve status --json`.
  - The `tailscale-services` and `hostnames` backends plan the steps only. Their `apply` refuses.
- **Guarded apply for the ports backend.**
  - It is a dry run unless called with `{ apply: true }`.
  - It refuses protected ports. It refuses ports with Funnel, a TCP forward or more than one handler.
  - It runs only the frozen copy of a plan it issued. It refuses an edited plan, or a plan another backend instance built.
  - It reads serve status again first, and refuses if anything the plan touches has changed.
- **`hostnames` backend for a name-based router.**
  - Names under one wildcard: `<app>[--<realm>].<projectMachineLabel>.<rootZone>`.
  - Renders the full nginx config:
    - a 421 default server;
    - per-app path `locations`;
    - several loopback `listeners`, with `X-Forwarded-Host` and `X-Forwarded-Port`;
    - an optional SNI `stream` router.
  - Per-app `hostnameTemplate` and `extraWildcardTemplates`.
  - Plan steps for provided TLS, lego DNS-01 (env names only), DNS records and the raw-TCP Serve step.
  - Status reports the router's TCP mapping.

### Changed

- **Name checks.** `edgeName` must be a single lowercase DNS label. `rootZone` and `hostname` must be DNS names of at most 253 characters, checked by `LocalEdgeCore_checkHostnameLabels`.
- **nginx path check.** Every path written into nginx config goes through one check: `LocalEdgeCore_nginxPathProblem` / `LocalEdgeCore_nginxPathArgument`. Paths containing whitespace, quotes, `; { } # $ \` or control characters are refused, not escaped.
- **Edge port check.** `hostnames.edgePort` must be a valid TCP port outside `protectedPorts`.
- **Two-character app names.** They work in the main realm. In other realms they are refused with `local-edge-core-hostname-short-app`, because `--` at positions 3-4 is reserved for IDN.
- **Ports backend.** It now skips an enabled app that has no edge port, instead of refusing the whole plan.

## 0.2.0

- Built JavaScript and declarations ship in `dist/`, so consumers install with no build step.
