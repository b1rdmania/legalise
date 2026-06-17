# Security Policy

Legalise is open source. The hosted site is a limited evaluation environment.

## Security posture

Legalise routes all model traffic through a single egress gateway, stores
provider keys encrypted with AES-256-GCM (decrypted only at call time),
scopes every matter to its owner (cross-user access returns 404, never
403), enforces capability grants at runtime, and writes a hash-chained,
append-only audit trail that any reader can independently re-verify.
Several controls are deliberately partial or deferred — an operator who
holds both the database and the master key can read matter content, data
residency is only partial, and Legalise produces **no** SBOM, signed
images, or SLSA provenance. We document those limits rather than hide
them.

**→ Read the full [Threat Model](docs/THREAT_MODEL.md)** for assets,
trust boundaries, per-attacker analysis (mitigated / residual /
deferred), and what is explicitly out of scope. This page is the front
door; the threat model is the substance.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Report vulnerabilities to:

- Email: `security@legalise.dev`
- GitHub Security Advisories: `github.com/b1rdmania/legalise`

Please include:

- affected commit or release, if known
- reproduction steps
- impact assessment
- whether any hosted evaluation data may be affected

We acknowledge reports within 48 hours. Please give us 90 days before public disclosure, longer where deployed users may be affected.

## Scope

In scope:

- the open-source Legalise repository
- the hosted legalise.dev evaluation environment
- authentication (including per-IP rate limiting on register / verification / password-reset), provider-key storage, matter access control, audit, storage, job execution, upload validation, and module capability enforcement

Out of scope:

- third-party model-provider behaviour
- forks or deployments not operated by the maintainer
- social engineering, spam, or denial-of-service testing without prior permission

There is no paid bug bounty programme. We will credit researchers in the changelog unless they prefer anonymity.
