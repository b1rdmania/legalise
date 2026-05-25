# Sandbox Strategy

Legalise runs legal modules that may come from third parties. The sandbox is therefore part of the product claim. No MCP server or module process should receive ambient access to the host filesystem, network, environment, or matter data.

V1 uses subprocess isolation with Linux controls. WASM is a future path for modules that can compile to it.

## V1 Decision

Use:

- subprocess per MCP server
- seccomp profile on Linux
- AppArmor profile where available
- RLIMIT for CPU, memory, file descriptors and process count
- explicit host bridge for filesystem, network, and matter resources

Do not use:

- Docker-per-module as the V1 default
- arbitrary host process execution
- ambient environment variables
- direct database access from modules
- direct object-storage access from modules

## Isolation Model

```text
module process
  ↓ stdio/SSE MCP transport
Legalise MCP host
  ↓ capability enforcement
host bridge
  ↓ audited access
Matter OS / storage / network proxy / provider gateway
```

The module process asks. The host decides.

## Filesystem Access

Default: no filesystem access outside the module package directory.

Allowed:

- module package directory, read-only
- temp directory created by host, scoped to invocation, deleted after completion

Denied:

- project root
- user home directory
- `.env`
- SSH keys
- arbitrary `/tmp`
- uploaded matter files by direct path

Matter documents are accessed through host resources, not paths.

## Network Access

Default: no network.

If `external_network: true`, the manifest must declare destinations.

Allowed network calls must route through the Legalise network proxy so audit can record:

- module id
- capability id
- destination
- method
- request hash
- response hash
- status code
- latency

Direct sockets from the module process should be blocked by sandbox profile where practical.

## Environment Variables

Modules do not receive the host environment.

Allowed env is generated per invocation:

- minimal runtime vars
- invocation id
- module id
- capability id
- no secrets unless declared and granted

Provider keys stay in Legalise `user_keys` and are accessed only through provider modules/gateway.

## Resource Limits

V1 defaults:

- CPU time: per capability default, overrideable by manifest within host max
- memory: capped per kind
- file descriptors: low cap
- process count: 1 unless explicitly granted
- output size: capped
- wall-clock timeout: required for every invocation

Resource exhaustion emits audit and fails append-only.

## Profiles By Kind

| Kind | Default Needs | Notes |
|---|---|---|
| `skill` | stdio, no filesystem, provider gateway only | Usually model-backed. |
| `tool` | temp files possible, network only if declared | Document reader/OCR needs temp files. |
| `workflow` | calls other capabilities via host | No direct provider access unless granted. |
| `provider` | network to provider destination | Handles credentials through host. |
| `gate` | no network by default | A gate cannot itself be gated. |

## Failure Semantics

Sandbox failures are append-only.

The runtime must emit:

- `module.sandbox.denied`
- `module.sandbox.timeout`
- `module.sandbox.memory_exceeded`
- `module.sandbox.network_denied`
- `module.sandbox.filesystem_denied`

Partial writes are not hidden. If a module writes before failing, the audit trail preserves both the write and the failure.

## Developer Mode

Developer mode can relax sandboxing locally only.

Requirements:

- impossible in non-dev environment
- explicit env flag
- banner in UI
- audit event on every relaxed invocation

Developer mode must not become the default self-host path.

## Future WASM Path

WASM is attractive for deterministic tools and document processors, but it constrains Python/Node MCP servers. V1 should not block future WASM.

Design constraints:

- manifest `runtime` can add `wasm`
- host bridge stays the same
- capability enforcement stays outside module
- audit boundary unchanged

## Phase 16 Pen Test Targets

Minimum sandbox tests:

- path traversal
- read `.env`
- read uploaded file by guessed path
- arbitrary outbound network
- fork bomb
- memory exhaustion
- long-running process
- stdout flooding
- symlink escape
- environment exfiltration

