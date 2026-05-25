# Module Signing

Legalise modules are supply-chain objects. Signing establishes who published a module and whether the manifest/package has changed since publication.

V1 uses Sigstore. Do not invent a custom PKI.

## Decision

Use Sigstore for:

- manifest signing
- module package signing
- verified publisher checks
- provenance where GitHub Actions is the publisher

Do not use raw GPG as the default. It is too hostile for the developer experience we want.

## Publisher Model

Publisher classes:

- `first_party`: Legalise-maintained.
- `verified`: known GitHub org/user, verified in registry.
- `community`: signed but not verified.
- `firm_private`: installed from local/private source.
- `unverified`: unsigned or unknown publisher.

Verified publisher registry starts as a repo-tracked configuration file and can become a hosted registry later.

## Signature Scope

The signature must cover:

- `legalise.module.json`
- module package digest
- publisher id
- module id
- module version
- source URL
- build provenance where available

Changing any of those invalidates the signature.

## Install Policy

| Signature Status | Publisher Status | Install Path |
|---|---|---|
| valid | first_party/verified | fast path |
| valid | community | full inspection |
| invalid | any | blocked by default |
| missing | firm_private | admin explicit trust |
| missing | unknown | blocked unless dev/admin override |

Overrides must emit audit and should be disabled in hosted evaluation.

## Update Policy

Every update re-verifies signature.

Permission expansion requires re-prompt even if signed by verified publisher.

Version rollback requires explicit confirmation and emits `module.rollback.approved`.

## Firm-Private Modules

Firm-private modules may not have public Sigstore provenance.

Allowed sources:

- local path
- private GitHub URL
- internal registry URL

The install flow must mark them as `firm_private` and record:

- source
- installer
- signature status
- explicit trust reason

## Audit Events

- `module.signature.checked`
- `module.signature.failed`
- `module.publisher.verified`
- `module.publisher.unverified`
- `module.install.trusted_unverified`
- `module.update.signature_checked`
- `module.rollback.approved`

## CI Requirements

First-party modules must be signed in CI before release.

CI should fail if:

- first-party module has no manifest
- manifest is invalid
- package digest is absent
- signing step fails

## Open Implementation Notes

Phase 0 locks Sigstore. Phase 3 chooses the exact Python library/wrapper and CLI mechanics. The runtime should isolate signing behind `backend/app/core/signing.py` so the mechanism can evolve without rewriting the registry.

