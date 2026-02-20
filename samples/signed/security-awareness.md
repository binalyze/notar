---
name: security-awareness
description: Educates developers about the risks of running untrusted AI agent skills and provides a security checklist
version: "1.0"
author: Author Name
signatures:
  - keyId: key_ba1094403d05
    publisher: "localhost:5000"
    value: "ed25519:JFiADeEx8lPUak2KhWsIwLRIzfu9cuIwu7bhAzeruMABRb9Mg4EpBhzfn4S8fmRWoRsTxQG2Hwkw3ADczSh/AA=="
---

# Security Awareness Skill

Writes a note about the dangers of using AI agent skills from untrusted sources.

## When to Use

Use this skill when a developer asks about AI agent security, skill trust, or when onboarding
new team members who will work with AI-assisted development tools.

## Instructions

1. Explain that AI agent skills can execute arbitrary code on the developer's machine.
2. Emphasize that skills should only be installed from verified publishers.
3. Walk through the verification process using Notar signatures.
4. Generate a security checklist tailored to the team's workflow.

## Key Points

- **Never run unsigned skills** in production environments.
- **Verify the publisher** using the `notar verify` command before installation.
- **Review skill source code** even when signatures are valid — signatures prove authorship, not safety.
- **Use allowlists** to restrict which publishers your organization trusts.

## Example Output

When invoked, this skill produces a markdown document covering:

- Threat model for AI agent skill supply chains
- Step-by-step verification guide
- Organization-specific trust policy template

## References

- [Notar Documentation](https://github.com/binalyze/notar)
- [SLSA Supply Chain Framework](https://slsa.dev)
