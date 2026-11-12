# Changelog

## 0.4.1 - 2026-11-12

### Changed

- **Messages no longer repeat raw input.** A problem, error or refusal may name the field, the rule, the length of a value and an identifier that already passed its own shape check. It never contains a value that is unchecked or long, because such a value may be oversized, hold control characters or be a secret pasted into the wrong field. Messages that used to quote a value now give its length instead, for example `hostnames.rootZone (12 characters) must have at least two labels`.
  - **Manifest and hostnames problems.** `hostname`, `rootZone`, `realm`, `projectMachineLabel`, `edgeName`, `acme.dnsProvider`, wildcards, location `path` and `upstreamPath`, stream route server names, stream upstreams and `connectTimeout`, and every path setting (`LocalEdgeCore_nginxPathProblem` no longer prints the path with `JSON.stringify`). A port or count that is not a number is reported as `<not a number>`.
  - **Apps.** An app id is named only when it has the app id shape and is at most 63 characters (one DNS label). Otherwise the app is named by its position, `apps[2]`, and a location by `locations[1]`. This covers `LocalEdgeCore_validateExposureManifest`, the hostnames problems, the plan text and the `tailscale-serve-ports` refusals.
  - **Hostnames.** A built host is repeated in "is not directly under" and "is already used by" only after it passed the label checks (an exact `host` already passed the value check). `LocalEdgeCore_checkDnsLabel` and `LocalEdgeCore_checkHostnameLabels` give the length and position of a bad label, not the label. An error thrown by a `buildHostname` function is no longer copied into a problem.
  - **Backends.** An unknown backend name and the backend name of a plan passed to `apply` are repeated only when they are short plain words.
  - **Command lines.** Unknown options, commands, methods and option values are repeated only when they look like a short option name or word (at most 48 characters). A short plain token pasted as a command-line value (for example `--exit-code` or `--method`) is still repeated, by design: command-line input is not secret. Environment values are never repeated.
  - **Environment values.** A message built from an environment variable's value names the variable and the rule only, never the value, whatever its length: `PORT must be a whole number from 1 to 65535.` The `Received '...'` and `Current value='...'` parts and the `NAME='value'` form are gone from `LocalEdgeCore_validatePort`, `LocalEdgeCore_validatePositiveInteger`, `LocalEdgeCore_parseRequiredPositiveInt`, `LocalEdgeCore_parseOptionalBooleanFlag`, `LocalEdgeCore_resolveConfiguredMethods` and `LocalEdgeCore_resolvePrimaryMethod`.
  - Manifest surface, upstream and realm names in route-plan errors follow the short-word rule.
  - **Legacy env key names.** The refusal from `LocalEdgeCore_resolveConfiguredMethods` lists at most five variable names, each only when it looks like an environment variable name (`^[A-Z][A-Z0-9_]{0,63}$`), and counts the rest. A name that does not fit is shown as its length. Values were never printed.
- The two manifest messages about an app id now start with the app name, like the other app messages: `web: app id is listed twice` (it was `app id "web" is listed twice`), and `apps[2]: app id (7 characters) must be lowercase letters, digits and dashes`.

## 0.4.0 - 2026-11-12

### Added

- **Exact hosts for name-based backends.** An app may set `host`, which wins over every pattern and the edge name. It must still sit directly under a configured wildcard, and duplicate hosts are refused by name. `LocalEdgeCore_exposureAppHost(settings, app)` returns the host an app gets.
- **Per-location proxy options** (`LocalEdgeCore_ExposureProxyOptions`). `proxy` on an app applies to `/`, and every extra location takes the same fields. Output for apps that set none of them is unchanged.
  - `upstreamHost` replaces the `Host` header sent upstream, for dev servers that refuse unknown hosts. It is a DNS name, a dotted-quad IPv4 address or a bracketed IPv6 literal, with an optional port from 1 to 65535, and at most 259 characters (`LOCAL_EDGE_CORE_NGINX_UPSTREAM_HOST_MAX_LENGTH`). Longer values, empty or leading/trailing-dot labels, labels over 63 characters, out-of-range IPv4 parts and ports outside 1-65535 are refused before rendering.
  - `buffering: false` renders `proxy_buffering off`, for event streams. It must be a boolean.
  - `readTimeout` sets `proxy_read_timeout` (an nginx time such as `3600s`, at most 9 characters). The default stays `300s`.
- **Shared value check.** `LocalEdgeCore_nginxValueProblem` and `LocalEdgeCore_nginxValueArgument` check the exact `host`, `upstreamHost` and `readTimeout` for length, characters nginx reads as syntax, and shape. Validation reports the problem, and render throws `local-edge-core-nginx-unsafe-value`.
  - A problem names the field, the rule and the length of the value, and never repeats any part of the value (an oversized value that also held an unsafe character used to show its first 60 characters).
  - A bare all-digit `upstreamHost` such as `0` is still refused, now with a message saying an all-digit host must be a full dotted IPv4 address.

### Changed

- An empty `upstreamPath` on an extra location is now accepted (it was refused before) and passes the request URI through unchanged (`proxy_pass http://127.0.0.1:<port>;` with no URI part).
- `LocalEdgeCore_resolveTailnetSuffix` now falls back to the reserved placeholder `tailnet.example`, exported as `LOCAL_EDGE_CORE_FALLBACK_TAILNET_SUFFIX`, instead of a hard-coded tailnet name. The return type is unchanged; pass a suffix or rely on detection to get a working value.
- Test fixtures use reserved documentation names only.
- `LOCAL_EDGE_CORE_FALLBACK_TAILNET_SUFFIX` and `LocalEdgeCore_resolveTailnetSuffix` carry `@example` documentation with reserved example values.

## 0.3.0 - 2026-11-12

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
