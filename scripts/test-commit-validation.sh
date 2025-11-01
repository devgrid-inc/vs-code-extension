#!/bin/bash

echo "Testing Commitlint Configuration"
echo "================================="
echo ""

# Test valid commits
echo "✅ Testing VALID commit messages:"
echo "-----------------------------------"

valid_commits=(
  "feat: add new authentication method"
  "fix: resolve token refresh issue"
  "docs: update installation guide"
  "feat(auth): add SSO support"
  "fix(tree-view)!: breaking change to tree structure"
  "chore(deps): update dependencies"
)

for commit in "${valid_commits[@]}"; do
  echo "$commit" | npx commitlint --quiet && echo "✅ PASS: $commit" || echo "❌ FAIL: $commit"
done

echo ""
echo "❌ Testing INVALID commit messages:"
echo "-----------------------------------"

invalid_commits=(
  "Add new feature"
  "Fixed bug"
  "feat Update docs"
  "feat: Add Feature."
  "FEAT: add feature"
)

for commit in "${invalid_commits[@]}"; do
  echo "$commit" | npx commitlint --quiet 2>/dev/null && echo "❌ SHOULD FAIL: $commit" || echo "✅ CORRECTLY REJECTED: $commit"
done

echo ""
echo "================================="
echo "Testing complete!"
