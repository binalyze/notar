# Security Policy

## Supported Versions

Only the latest release of `@binalyze/notar` is supported with security updates.

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
| Older   | No        |

## Security Advisories

- **v2.0.0** — Fixed two verification-verdict issues where `valid: true` did not
  guarantee the file was signed by the expected identity. `verifyFromAuthor` now
  binds the verdict to a trusted publisher: a present-but-failing signature is
  fatal, an optional `expectedPublisher` scopes the verdict to a chosen identity,
  and the unauthenticated `author` field is surfaced as *claimed*. The web app no
  longer silently falls back from a user-pinned public key to publisher-resolved
  verification. **Upgrading to 2.0.0 is required** to pick up these fixes; the
  verdict-semantics change is the reason for the major version bump.

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/binalyze/notar/security/advisories).

**Do not open a public issue for security vulnerabilities.**

### What to expect

- **Acknowledgment**: Within 48 hours of your report.
- **Resolution**: We aim to release a fix within 90 days of a confirmed vulnerability.
- **Disclosure**: We will coordinate disclosure timing with you.

## Scope

The following are in scope for security reports:

- Cryptographic weaknesses (signature forgery, key leakage)
- Key handling issues (improper storage, exposure)
- SSRF or injection vulnerabilities in the web worker
- Worker abuse or bypass of verification logic

## Out of Scope

- Social engineering attacks
- Denial of service against the public instance
- Issues in dependencies (report these upstream)
