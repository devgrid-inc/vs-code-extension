# Pull Request

## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the appropriate option with an 'x' -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Build/tooling update

## Related Issues

<!-- Link to related issues using #issue-number -->

Closes #
Relates to #

## Changes Made

<!-- List the specific changes made in this PR -->

- 
- 
- 

## Testing

<!-- Describe how you tested these changes -->

- [ ] Manual testing performed
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing (`npm run test:run`)

### Test Environment

- **VS Code Version**: 
- **OS**: 
- **Node Version**: 

### Test Steps

1. 
2. 
3. 

## Screenshots (if applicable)

<!-- Add screenshots to help explain your changes -->

## Checklist

<!-- Mark completed items with an 'x' -->

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] I have used conventional commits for my commit messages
- [ ] I have updated the CHANGELOG.md (if applicable)

## Breaking Changes

<!-- If this is a breaking change, describe the impact and migration path -->

**Impact:**


**Migration Guide:**


## Additional Notes

<!-- Add any additional notes or context about the PR -->

---

**Commit Message Convention:**

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Your commits should follow this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Examples:**
- `feat(auth): add SSO authentication support`
- `fix(tree-view): resolve vulnerability count display issue`
- `docs(readme): update installation instructions`

For breaking changes:
```
feat(api)!: update GraphQL client to v2

BREAKING CHANGE: The GraphQL client has been updated to v2.
All queries now require authentication tokens.
```
