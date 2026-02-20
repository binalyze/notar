---
name: code-review
description: Performs automated code review with configurable rulesets for TypeScript and Python projects
version: "2.1"
author: Author Name
signatures:
  - keyId: key_ba1094403d05
    publisher: "localhost:5000"
    value: "ed25519:7QsC2z8ZlPIwRgFX6+zJ1wrpFrz4oONNLcrqpMGRNuJoQ33OQuKc1tf6u3AdsQxhZqofbgUd/zLtjoydf1v0Bg=="
---

# Code Review Skill

Automated code review assistant that applies configurable rulesets to pull requests
and generates structured feedback.

## When to Use

Invoke this skill during pull request review or before merging feature branches.
It works best with TypeScript and Python codebases but supports any language for
general pattern checks.

## Instructions

1. Analyze the diff provided by the user or read from the current git branch.
2. Apply the ruleset from `scripts/review-rules.yaml` (bundled in the skill package).
3. For each finding, provide:
   - Severity (error, warning, info)
   - File path and line number
   - Description of the issue
   - Suggested fix with code snippet
4. Summarize the review at the end with counts per severity.

## Configuration

The skill reads an optional `.code-review.yaml` in the project root:

```yaml
rules:
  max-function-length: 50
  require-error-handling: true
  no-console-in-production: true
ignored-paths:
  - "**/*.test.ts"
  - "vendor/**"
```

## Scripts

This skill includes a helper script at `scripts/review.sh` that can be run
standalone to perform a quick lint pass:

```bash
#!/bin/bash
# Quick review pass using the bundled ruleset
eslint --config .eslintrc.review.json "$@"
```

## References

- [ESLint Rules Reference](https://eslint.org/docs/rules/)
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)
