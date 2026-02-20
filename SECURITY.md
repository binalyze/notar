# Security Policy

## Supported Versions

Only the latest release of `@binalyze/notar` is supported with security updates.

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
| Older   | No        |

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
