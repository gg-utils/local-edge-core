# Changelog

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
