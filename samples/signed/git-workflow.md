---
name: git-workflow
description: Enforces conventional commit messages, branch naming, and PR templates for consistent git workflows
version: "1.3"
author: Author Name
signatures:
  - keyId: key_ba1094403d05
    publisher: "localhost:5000"
    value: "ed25519:iw40NKiDCBJ9YOA0k39TC5adGAp4MMmWjrhMbPHlECN9Pwj7f1KX4EeppJYWtTgs1dC63rCoidpFl2+pVhtjDA=="
---

# Git Workflow Skill

Enforces and automates consistent git workflows including conventional commits,
branch naming conventions, and pull request templates.

## When to Use

Use this skill when:
- Setting up a new repository with standardized git practices
- A developer asks about commit message formatting
- Automating PR creation with structured descriptions
- Enforcing branch naming conventions (e.g., `feat/`, `fix/`, `chore/`)

## Instructions

1. Parse the current git log to detect existing conventions (if any).
2. Suggest or enforce the Conventional Commits specification.
3. Validate branch names against the configured pattern.
4. Generate PR descriptions from commit messages when requested.

## Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Supported types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`.

## Branch Naming

Branches must match the pattern:

```
(feat|fix|chore|docs|refactor|test|ci)/<ticket-id>-<short-description>
```

Example: `feat/PROJ-123-add-user-auth`

## PR Template

When generating PR descriptions, use this structure:

```markdown
## Summary
<!-- One-paragraph description -->

## Changes
<!-- Bullet list of changes -->

## Testing
<!-- How was this tested? -->

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No breaking changes
```

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Branching Strategies](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)
