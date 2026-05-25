# Trust Ceremony

Installing a Legalise module is a supply-chain event. A module can read sensitive legal data, call external services, generate legal outputs, and write to the matter record. The install flow must therefore make trust explicit.

The trust ceremony is not optional UX. It is the safety mechanism that turns untrusted capabilities into governed capabilities.

## Principles

1. No module executes before it is installed and granted.
2. No install completes without a permission card.
3. Permission expansion re-prompts before update activation.
4. Unverified publishers require explicit trust.
5. Verified publishers get a fast path, but permissions remain visible.
6. Every install, grant, revoke, update, denial, and failure emits audit.

## Install States

```text
discovered
  → inspected
  → signature_checked
  → publisher_checked
  → permissions_reviewed
  → gates_reviewed
  → granted
  → enabled
```

Failure terminal states:

```text
rejected_by_user
signature_failed
publisher_blocked
dependency_missing
permission_denied
sandbox_profile_missing
```

## Verified Publisher Fast Path

For first-party or verified publishers:

1. Show publisher and signature status.
2. Show permission card.
3. Enable.

The permission card is still visible. It is just not a seven-step inspection.

Use for:

- Legalise first-party modules.
- Verified GitHub organisations in the publisher registry.
- Firm-private publishers explicitly trusted by the workspace admin.

## Unverified Publisher Full Path

For unsigned or unverified modules:

1. Inspect manifest.
2. Verify signature status.
3. Show publisher warning.
4. Show permissions.
5. Show data movement.
6. Show gates and advice tier.
7. Explicit trust and grant.

The final action label must be explicit, for example:

```text
Trust publisher and enable module
```

not:

```text
Continue
```

## Permission Card

The permission card is generated from the manifest.

It must show:

- module name
- publisher
- signature status
- version
- visibility
- capability kind
- scope
- reads
- writes
- model access
- external network
- external destinations
- document body/binary movement
- advice tier max
- gates
- output lifecycle target
- audit events emitted
- dependencies

Example:

```text
Document Redliner wants to:
- read document bodies in this matter
- write proposed redlines
- write generated documents
- call configured model providers
- emit audit rows for each proposed and accepted change

Gates:
- privilege posture
- advice boundary

Highest output tier:
- draft advice

Data leaves workspace:
- yes, if a cloud provider is selected
```

## Grant Scope

V1 grants are scoped to:

```text
workspace_id × matter_id? × module_id × capability_id
```

Matter-scoped capabilities require a matter id.

Workspace/global capabilities can be granted without a matter id, but cannot access matter state without additional matter-scoped grants.

## Revocation

Users with permission to manage modules can revoke grants.

Revocation must:

- disable future invocations
- preserve historical outputs
- preserve audit entries
- emit `module.grant.revoked`
- record actor, module id, capability id, scope, matter id if any, reason if provided

Matter closure automatically revokes matter-scoped grants.

## Update Flow

Manual updates only in V1.

When a module update is available:

1. Fetch manifest.
2. Verify signature.
3. Diff permission snapshot against installed version.
4. If no expansion, allow update with compact confirmation.
5. If expansion, re-run permission card and require explicit grant.

Permission expansion includes:

- new read capability
- new write capability
- higher advice tier
- new external network destination
- document body/binary movement added
- weaker or removed gate
- new provider/model access

## Audit Events

Minimum events:

- `module.discovered`
- `module.manifest.inspected`
- `module.signature.checked`
- `module.publisher.checked`
- `module.permissions.reviewed`
- `module.grant.created`
- `module.enabled`
- `module.denied`
- `module.update.available`
- `module.update.approved`
- `module.update.blocked`
- `module.grant.revoked`

## API Shape

Suggested endpoints:

```text
GET  /api/modules
GET  /api/modules/{module_id}
POST /api/modules/install
POST /api/modules/{module_id}/enable
POST /api/modules/{module_id}/revoke
POST /api/modules/{module_id}/update
```

Install request:

```json
{
  "source": "github",
  "url": "https://github.com/legalise/modules/companies-house",
  "version": "1.0.0",
  "matter_id": "optional-for-matter-scoped-grants"
}
```

Install response:

```json
{
  "state": "permissions_reviewed",
  "module": {},
  "permission_card": {},
  "requires_explicit_trust": true
}
```

## UI Requirements

- Permission card text must be understandable to lawyers and developers.
- Data movement must be visually prominent.
- Signature failure must block install unless explicitly overridden by admin-only dev mode.
- Unverified install must not be a one-click path.
- Verified install must stay quick enough for the five-minute first-audit-row OKR.

