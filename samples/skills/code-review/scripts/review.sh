#!/bin/bash
set -euo pipefail

# Quick code review pass using ESLint with the bundled review config.
# Usage: ./review.sh [files...]
#   If no files are given, reviews all staged changes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SCRIPT_DIR}/../.eslintrc.review.json"

if [ $# -eq 0 ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx')
  if [ -z "$FILES" ]; then
    echo "No staged TypeScript/JavaScript files to review."
    exit 0
  fi
  echo "Reviewing staged files..."
  echo "$FILES" | xargs eslint --config "$CONFIG" --format stylish
else
  eslint --config "$CONFIG" --format stylish "$@"
fi

echo "Review complete."
