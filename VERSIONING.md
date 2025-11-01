# Versioning Guide

This project follows [Semantic Versioning](https://semver.org/) and uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

## Table of Contents

- [Semantic Versioning](#semantic-versioning)
- [Conventional Commits](#conventional-commits)
- [Making Changes](#making-changes)
- [Creating a Release](#creating-a-release)
- [Tools & Automation](#tools--automation)

## Semantic Versioning

Version format: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### Version Components

- **MAJOR** (`1.0.0`): Breaking changes, incompatible API changes
  - Example: Removing commands, changing command behavior, major refactoring
- **MINOR** (`0.1.0`): New features, backward-compatible additions
  - Example: Adding new commands, new configuration options
- **PATCH** (`0.0.1`): Bug fixes, backward-compatible fixes
  - Example: Fixing authentication issues, UI tweaks

### Pre-1.0.0 Development

We're currently in `0.x.y` (initial development):
- **Breaking changes** can happen in MINOR versions (0.1.0, 0.2.0)
- **New features** increment MINOR (0.1.0 → 0.2.0)
- **Bug fixes** increment PATCH (0.1.0 → 0.1.1)

### Post-1.0.0 Stable

After `1.0.0` release, strict SemVer applies:
- Breaking changes **require** MAJOR bump
- New features **require** MINOR bump
- Bug fixes **require** PATCH bump

### Pre-release Versions

For testing before official release:
- **Alpha**: `0.2.0-alpha.1` - Very early, unstable
- **Beta**: `0.2.0-beta.1` - Feature complete, testing
- **RC**: `0.2.0-rc.1` - Release candidate, final testing

## Conventional Commits

All commits MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | MINOR |
| `fix` | Bug fix | PATCH |
| `docs` | Documentation only | None |
| `style` | Code style (formatting, semicolons, etc) | None |
| `refactor` | Code refactoring | None |
| `perf` | Performance improvement | PATCH |
| `test` | Adding or updating tests | None |
| `build` | Build system or dependencies | None |
| `ci` | CI/CD changes | None |
| `chore` | Maintenance tasks | None |
| `revert` | Revert previous commit | Depends |

### Breaking Changes

To indicate a breaking change, add `!` after the type or `BREAKING CHANGE:` in the footer:

```bash
feat!: remove deprecated signOut command

BREAKING CHANGE: The signOut command has been removed. Use devgrid.signOut instead.
```

This will trigger a **MAJOR** version bump.

### Examples

**New Feature:**
```bash
feat(auth): add SSO authentication support

Adds single sign-on authentication for enterprise users.
Supports SAML 2.0 and OAuth 2.0 providers.

Closes #123
```

**Bug Fix:**
```bash
fix(tree-view): resolve vulnerability count display issue

Fixed issue where vulnerability count was showing incorrect
numbers after cache clear.

Fixes #456
```

**Documentation:**
```bash
docs(readme): update installation instructions

Added troubleshooting section for common installation issues.
```

**Breaking Change:**
```bash
feat(api)!: update GraphQL client to v2

BREAKING CHANGE: The GraphQL client has been updated to v2.
All queries now require authentication tokens.

Migrated from Apollo Client v2 to v3.
```

## Making Changes

### Interactive Commit (Recommended)

Use Commitizen for guided commit messages:

```bash
# Stage your changes
git add .

# Use commitizen
npm run commit

# Follow the prompts:
# 1. Select type (feat, fix, etc.)
# 2. Enter scope (optional): auth, tree-view, api, etc.
# 3. Write short description
# 4. Write longer description (optional)
# 5. List breaking changes (if any)
# 6. Reference issues (if any)
```

### Manual Commit

If you prefer manual commits, follow the format:

```bash
git add .
git commit -m "feat(cache): add cache clear command"
```

**Note:** Commits are validated automatically. Invalid formats will be rejected.

## Creating a Release

### Automatic Versioning

Use `standard-version` to automatically:
1. Determine version bump (based on commits)
2. Update `package.json`
3. Generate/update `CHANGELOG.md`
4. Create Git commit and tag

### Release Commands

```bash
# Automatic version bump (recommended)
npm run release

# Specific version bump
npm run release:minor   # 0.1.0 → 0.2.0
npm run release:major   # 0.1.0 → 1.0.0
npm run release:patch   # 0.1.0 → 0.1.1

# Pre-release versions
npm run release -- --prerelease alpha  # 0.1.0 → 0.1.1-alpha.0
npm run release -- --prerelease beta   # 0.1.0 → 0.1.1-beta.0
npm run release -- --prerelease rc     # 0.1.0 → 0.1.1-rc.0

# Dry run (see what would happen)
npm run release -- --dry-run

# First release (from 0.0.1)
npm run release -- --first-release
```

### Release Workflow

1. **Ensure all changes are committed**
   ```bash
   git status  # Should be clean
   ```

2. **Run tests and validation**
   ```bash
   npm run check
   npm run validate
   ```

3. **Create release**
   ```bash
   npm run release
   ```

4. **Review changes**
   - Check `package.json` version
   - Review `CHANGELOG.md` updates
   - Verify Git tag was created

5. **Push to GitHub**
   ```bash
   git push --follow-tags origin main
   ```

6. **Create GitHub Release**
   - Go to GitHub releases page
   - Click "Draft a new release"
   - Select the new tag
   - Copy changelog content
   - Attach `.vsix` file
   - Publish release

7. **Publish to Marketplace**
   ```bash
   npm run package
   npm run publish
   ```

## Tools & Automation

### Installed Tools

- **[standard-version](https://github.com/conventional-changelog/standard-version)**: Automated versioning and changelog
- **[commitizen](https://github.com/commitizen/cz-cli)**: Interactive commit message builder
- **[commitlint](https://github.com/conventional-changelog/commitlint)**: Commit message linter
### Configuration Files

- `.versionrc.json`: standard-version configuration
- `.commitlintrc.json`: commitlint rules
- `.czrc`: commitizen configuration

## Version History

### Current Version: 0.0.1

**Initial Release** - October 31, 2025

### Future Versions

- **0.1.0**: Add filtering/search, GraphQL code generation
- **0.2.0**: Add monitoring/telemetry, token refresh
- **1.0.0**: Production-ready, stable API

## Best Practices

### DO:
✅ Use `npm run commit` for interactive commits  
✅ Write clear, descriptive commit messages  
✅ Reference issue numbers in commits  
✅ Test before creating a release  
✅ Review changelog before pushing  
✅ Use pre-release versions for testing  

### DON'T:
❌ Skip commit message validation  
❌ Manually edit version in package.json  
❌ Manually edit CHANGELOG.md  
❌ Force push release tags  
❌ Release without testing  

## Troubleshooting

### Commit Rejected

If your commit is rejected:
```bash
# Check the error message
# Fix the commit message format
git commit --amend
```

### Wrong Version Bump

If the version bump is wrong:
```bash
# Before pushing, you can undo:
git reset --hard HEAD~1
git tag -d v0.2.0  # Delete the tag

# Then create release again with correct options
npm run release:patch  # Or :minor, :major
```

### Update Existing Release

If you need to update after pushing:
```bash
# Don't do this! It causes problems
# Instead, create a new patch release
npm run release:patch
```

## Resources

- [Semantic Versioning Spec](https://semver.org/)
- [Conventional Commits Spec](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [standard-version docs](https://github.com/conventional-changelog/standard-version)
- [commitizen docs](https://github.com/commitizen/cz-cli)

## Questions?

- Open an issue: https://github.com/devgrid-inc/vs-code-extension/issues
- Check CONTRIBUTING.md
- Review existing releases for examples
