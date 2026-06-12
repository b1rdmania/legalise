# Security Policy

Legalise is open source. The hosted site is a limited evaluation environment.

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
