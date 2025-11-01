# Release Process

This document describes the complete release process for the DevGrid VS Code Extension.

## Overview

We use automated semantic versioning with [standard-version](https://github.com/conventional-changelog/standard-version) based on [Conventional Commits](https://www.conventionalcommits.org/). This ensures consistent versioning and automated changelog generation.

## Prerequisites

Before creating a release:

1. **All changes committed**: Working directory should be clean
2. **All tests passing**: `npm run check` succeeds
3. **Validation passing**: `npm run validate` succeeds
4. **On main branch**: Or release branch for hotfixes

## Release Types

### Automatic Version Bump (Recommended)

Let standard-version determine the version bump based on commits:

```bash
npm run release
```

This will:
- Analyze commits since last release
- Determine version bump (major/minor/patch)
- Update `package.json`
- Generate/update `CHANGELOG.md`
- Create Git commit and tag

### Manual Version Bump

For specific version bumps:

```bash
# Patch release (0.0.1 → 0.0.2)
npm run release:patch

# Minor release (0.0.1 → 0.1.0)
npm run release:minor

# Major release (0.0.1 → 1.0.0)
npm run release:major
```

### Pre-release Versions

For testing before official release:

```bash
# Alpha release (0.1.0 → 0.1.1-alpha.0)
npm run release:alpha

# Beta release (0.1.0 → 0.1.1-beta.0)
npm run release:beta

# Release candidate (0.1.0 → 0.1.1-rc.0)
npm run release:rc
```

### Dry Run

To see what would happen without making changes:

```bash
npm run release:dry
```

## Step-by-Step Release Process

### 1. Pre-Release Checks

```bash
# Ensure you're on the correct branch
git checkout main
git pull origin main

# Verify working directory is clean
git status

# Run all checks
npm run check

# Run validation
npm run validate

# Build the extension
npm run bundle
```

### 2. Create Release

```bash
# Create the release
npm run release

# Or for specific version:
npm run release:minor
```

**What happens:**
1. ✅ Bumps version in `package.json`
2. ✅ Updates `CHANGELOG.md` with new version section
3. ✅ Creates Git commit: `chore(release): x.y.z`
4. ✅ Creates Git tag: `vx.y.z`

### 3. Review Changes

```bash
# View the commit
git log -1

# View the tag
git tag -l -n1

# Review CHANGELOG
cat CHANGELOG.md

# View diff
git diff HEAD~1
```

### 4. Push to GitHub

```bash
# Push commits and tags
git push --follow-tags origin main

# Or separately:
git push origin main
git push origin --tags
```

### 5. Create GitHub Release

1. Go to: https://github.com/devgrid-inc/vs-code-extension/releases
2. Click **"Draft a new release"**
3. **Choose tag**: Select the new `vx.y.z` tag
4. **Release title**: `Version x.y.z`
5. **Description**: Copy from `CHANGELOG.md` for this version
6. **Assets**: Attach the `.vsix` file (see step 6)
7. Click **"Publish release"**

### 6. Package Extension

```bash
# Create .vsix package
npm run package

# This will:
# 1. Run validation
# 2. Create devgrid-vscode-extension-x.y.z.vsix

# Verify package
ls -lh *.vsix
```

### 7. Publish to Marketplace

#### First-Time Setup

1. Create VS Code publisher account:
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create organization: `devgrid-inc`

2. Create Personal Access Token (PAT):
   - Go to https://dev.azure.com/
   - User Settings → Personal Access Tokens
   - Create token with `Marketplace (Manage)` scope
   - Save token securely

3. Login with vsce:
   ```bash
   npx vsce login devgrid-inc
   # Enter PAT when prompted
   ```

#### Publishing

```bash
# Publish to marketplace
npm run publish

# Or manually:
npx vsce publish

# For pre-release:
npx vsce publish --pre-release
```

**What happens:**
1. ✅ Validates package
2. ✅ Uploads to VS Code Marketplace
3. ✅ Extension becomes available for installation

### 8. Verify Publication

1. **Marketplace**: https://marketplace.visualstudio.com/items?itemName=devgrid-inc.devgrid-vscode-extension
2. **In VS Code**: Search for "DevGrid" in Extensions
3. **Check version**: Should show new version
4. **Test installation**: Install and verify functionality

### 9. Announce Release

- Update internal documentation
- Notify team via Slack/Discord
- Post to social media if major release
- Update website if applicable

## Hotfix Process

For urgent fixes to production version:

```bash
# Create hotfix branch from tag
git checkout -b hotfix/1.0.1 v1.0.0

# Make fix
git add .
git commit -m "fix: critical authentication issue"

# Create patch release
npm run release:patch

# Push
git push --follow-tags origin hotfix/1.0.1

# Merge to main
git checkout main
git merge hotfix/1.0.1
git push origin main
```

## Rollback

If you need to undo a release **before pushing**:

```bash
# Undo the commit
git reset --hard HEAD~1

# Delete the tag
git tag -d v0.1.0

# Try again
npm run release
```

**After pushing**, don't rollback. Instead, create a new patch release with the fix.

## Version History

### Current Version: 0.0.1
- Initial release
- Core features: authentication, vulnerability display, YAML setup

### Future Versions

**0.1.0** (Next Minor Release)
- Planned: Search/filtering, enhanced caching
- Estimated: Q1 2025

**0.2.0** (Following Minor Release)
- Planned: Monitoring, token refresh, analytics
- Estimated: Q2 2025

**1.0.0** (Stable Release)
- Planned: Production-ready, stable API
- Estimated: Q3 2025

## Troubleshooting

### Release Failed

**Error: Working directory not clean**
```bash
git status  # Check for uncommitted changes
git stash   # Stash changes if needed
npm run release
```

**Error: Tag already exists**
```bash
# Delete local tag
git tag -d v0.1.0

# Delete remote tag (if pushed)
git push origin :refs/tags/v0.1.0

# Try again
npm run release
```

### Package Failed

**Error: Validation failed**
```bash
npm run validate  # See specific errors
# Fix issues
npm run package
```

**Error: Missing files in package**
- Check `.vscodeignore`
- Ensure `dist/` directory exists
- Run `npm run bundle` first

### Publish Failed

**Error: Authentication failed**
```bash
# Re-login
npx vsce login devgrid-inc

# Verify
npx vsce ls-publishers
```

**Error: Version already exists**
- Bump version: `npm run release:patch`
- Don't republish same version

## Best Practices

### DO:
✅ Always run `npm run check` before releasing  
✅ Review changelog before pushing  
✅ Test `.vsix` locally before publishing  
✅ Use conventional commits  
✅ Document breaking changes clearly  
✅ Update documentation with release  

### DON'T:
❌ Force push release tags  
❌ Skip validation steps  
❌ Release with failing tests  
❌ Manually edit `package.json` version  
❌ Manually edit `CHANGELOG.md`  
❌ Release from feature branches  

## CI/CD (Future)

Planned automation:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run check
      - run: npm run release
      - run: git push --follow-tags
      - run: npm run package
      - run: npm run publish
```

## Resources

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [standard-version docs](https://github.com/conventional-changelog/standard-version)
- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)

## Support

For questions or issues:
- Open an issue: https://github.com/devgrid-inc/vs-code-extension/issues
- Contact: support@devgrid.io
- Internal: #devgrid-extension on Slack

