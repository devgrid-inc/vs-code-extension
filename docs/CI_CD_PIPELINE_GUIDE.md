# CI/CD Pipeline Guide

Complete guide to the automated CI/CD pipelines for the DevGrid VS Code Extension.

## Overview

The project uses GitHub Actions for automated validation, testing, and releasing. The pipeline is designed to:

1. **Validate on every push** (any branch)
2. **Run comprehensive tests** on PRs
3. **Create releases automatically** on main branch
4. **Publish to marketplace** on release

## Workflows

### 1. Quick Check (Runs on ALL branches)

**File**: `.github/workflows/quick-check.yml`

**Triggers**: Push to any branch

**Purpose**: Fast feedback loop for developers working on feature branches

**Checks**:
- ✅ Commit message validation (Conventional Commits)
- ✅ Linting (ESLint)
- ✅ Tests (Vitest)
- ✅ Formatting (Prettier)
- ✅ Package validation
- ✅ Build (TypeScript compilation)

**Timeout**: 10 minutes

**Runs on**: Ubuntu (fastest)

**Why this is important**: Catches issues immediately before they get to PRs, even on feature branches.

---

### 2. CI - Comprehensive Testing

**File**: `.github/workflows/ci.yml`

**Triggers**: Push to any branch, PRs to any branch

**Purpose**: Comprehensive testing across platforms and Node versions

**Matrix**:
- **OS**: Ubuntu, macOS, Windows
- **Node**: 18, 20

**Checks**:
- Linting
- Tests
- Formatting
- Package validation
- Build
- VSIX packaging (Ubuntu + Node 20 only)

**Artifacts**: 
- VSIX package (7-day retention)
- Coverage report (30-day retention)

**Coverage**: 
- Generated automatically
- Stored as GitHub artifact
- Commented on PRs
- Available in workflow summary

---

### 3. Validate Commits

**File**: `.github/workflows/validate-commits.yml`

**Triggers**: 
- PRs (all commits in PR)
- Push to any branch (last commit)

**Purpose**: Enforce Conventional Commits standard

**Features**:
- Validates all commits in a PR
- Shows commit type breakdown (feat, fix, docs, etc.)
- Predicts version bump (MINOR, PATCH, or none)
- Adds summary to PR

**Example Output**:
```
Commit Summary:
- ✨ Features: 2
- 🐛 Bug Fixes: 1
- 📚 Documentation: 1
- 🔧 Other: 3

This PR will trigger a MINOR version bump (new features).
```

---

### 4. Release (Main branch only)

**File**: `.github/workflows/release.yml`

**Triggers**: 
- Push to `main` branch
- Manual workflow dispatch

**Purpose**: Automated version bumping and release creation

**Process**:
1. Run all checks (lint, test, format, validate)
2. Determine release type (auto or manual)
3. Run `standard-version` to bump version
4. Update CHANGELOG.md
5. Create Git commit and tag
6. Build and package extension
7. Push changes to GitHub
8. Create GitHub Release with `.vsix` attached

**Auto Release Logic**:
```bash
# Only creates release if there are feat/fix/perf commits
if commits contain "feat:" OR "fix:" OR "perf:":
  → Create release
else:
  → Skip release
```

**Manual Release Options**:
- `auto` - Automatic based on commits (default)
- `patch` - 0.0.1 → 0.0.2
- `minor` - 0.0.1 → 0.1.0
- `major` - 0.0.1 → 1.0.0
- `alpha` - 0.1.0 → 0.1.1-alpha.0
- `beta` - 0.1.0 → 0.1.1-beta.0
- `rc` - 0.1.0 → 0.1.1-rc.0

**Manual Trigger**:
```
GitHub → Actions → Release → Run workflow → Select type
```

---

### 5. Publish to Marketplace

**File**: `.github/workflows/publish.yml`

**Triggers**:
- GitHub Release published
- Manual workflow dispatch

**Purpose**: Publish extension to VS Code Marketplace (and Open VSX)

**Process**:
1. Checkout code at release tag
2. Run all checks
3. Build and package
4. Publish to VS Code Marketplace (requires `VSCE_PAT`)
5. Publish to Open VSX Registry (requires `OVSX_PAT`, optional)

**Requirements**:
- GitHub secret: `VSCE_PAT` (VS Code Marketplace token)
- GitHub secret: `OVSX_PAT` (Open VSX token, optional)

---

## Secrets Configuration

### Required Secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

#### 1. `VSCE_PAT` (Required for publishing)

**Purpose**: Personal Access Token for VS Code Marketplace

**How to create**:
1. Go to https://dev.azure.com/
2. Click **User Settings** → **Personal Access Tokens**
3. Click **New Token**
4. **Name**: "VS Code Marketplace Publishing"
5. **Organization**: All accessible organizations
6. **Scopes**: 
   - ✅ Marketplace → **Manage**
7. Click **Create**
8. Copy the token (won't be shown again)
9. Add to GitHub Secrets as `VSCE_PAT`

#### 2. `OVSX_PAT` (Optional)

**Purpose**: Token for Open VSX Registry (alternative marketplace)

**How to create**:
1. Go to https://open-vsx.org/
2. Sign in with GitHub
3. Go to **User Settings** → **Access Tokens**
4. Create new token
5. Add to GitHub Secrets as `OVSX_PAT`

#### 3. Coverage Reports (Built-in)

**Purpose**: Track code coverage over time

**How it works**:
- Coverage reports are generated on every CI run
- Stored as GitHub Actions artifacts (30-day retention)
- Automatically commented on PRs
- No third-party services required
- All data stays within GitHub

**Benefits**:
- ✅ Secure - No external data sharing
- ✅ Free - No additional cost
- ✅ Simple - No setup required
- ✅ Private - Coverage data stays in your repo

---

## Branch Protection Rules

### Recommended Settings

**Settings → Branches → Add rule**

**Branch name pattern**: `main`

**Protect matching branches**:
- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
  - ✅ Dismiss stale approvals
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date
  - **Required checks**:
    - `Quick Validation`
    - `Test & Lint (ubuntu-latest, 20)`
    - `Validate Commit Messages`
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings

---

## Workflow Triggers Summary

| Workflow | Any Branch | Main Branch | PRs | Manual |
|----------|------------|-------------|-----|--------|
| Quick Check | ✅ | ✅ | ❌ | ❌ |
| CI | ✅ | ✅ | ✅ | ❌ |
| Validate Commits | ✅ | ✅ | ✅ | ❌ |
| Release | ❌ | ✅ | ❌ | ✅ |
| Publish | ❌ | ❌ | ❌ | ✅ (on release) |

---

## Development Workflow

### Working on a Feature Branch

```bash
# 1. Create feature branch
git checkout -b feature/my-awesome-feature

# 2. Make changes
# ...

# 3. Commit with conventional format
git add .
npm run commit  # Interactive commit

# 4. Push to GitHub
git push origin feature/my-awesome-feature
```

**What happens**:
- ✅ Quick Check runs immediately
- ✅ CI runs (all platforms)
- ✅ Commit validation runs
- ✅ Get feedback within 5-10 minutes

### Creating a Pull Request

```bash
# Create PR on GitHub
# Title: "feat: add awesome feature"
# Description: What changed and why
```

**What happens**:
- ✅ All validation workflows run
- ✅ Status checks appear on PR
- ✅ Shows version bump prediction
- ✅ Must pass before merge

### Merging to Main

```bash
# After approval, merge PR
# (Use "Squash and merge" to keep history clean)
```

**What happens**:
- ✅ Quick Check runs on main
- ✅ CI runs on main
- ✅ Release workflow checks for releasable commits
- ✅ If feat/fix/perf commits exist:
  - Creates new version
  - Updates CHANGELOG
  - Creates Git tag
  - Creates GitHub Release with .vsix
- ✅ If no releasable commits:
  - Skips release (e.g., for docs-only changes)

### Publishing to Marketplace

**Automatic** (recommended):
```
1. Merge PR to main
2. Release workflow creates GitHub Release
3. Publish workflow triggers automatically
4. Extension published to marketplace
```

**Manual**:
```
1. Go to: Actions → Publish to Marketplace
2. Click: Run workflow
3. Enter version or leave empty for latest
4. Click: Run workflow
```

---

## Manual Release Process

### Creating a Specific Release Type

```bash
# Go to GitHub Actions
Actions → Release → Run workflow

# Select options:
- Branch: main
- Release type: minor (or major, patch, alpha, beta, rc)

# Click: Run workflow
```

### Emergency Hotfix

```bash
# 1. Create hotfix branch from tag
git checkout -b hotfix/critical-fix v1.0.0

# 2. Make fix
git add .
git commit -m "fix: critical security issue"

# 3. Push and create PR
git push origin hotfix/critical-fix

# 4. After merge to main:
# 5. Manually trigger release:
Actions → Release → Run workflow → Select "patch"
```

---

## Troubleshooting

### Release Workflow Not Creating Release

**Check**:
1. Are there `feat`, `fix`, or `perf` commits since last release?
2. View workflow logs for "No releasable commits found"

**Solution**:
- Ensure commits follow conventional format
- Or manually trigger: Actions → Release → Run workflow

### Publish Workflow Failing

**Common causes**:
1. **Missing VSCE_PAT secret**
   - Add token to GitHub Secrets
2. **Invalid token**
   - Generate new token with Marketplace (Manage) scope
3. **Version already published**
   - Can't republish same version
   - Create new release

### Commit Validation Failing on Push

**Error**: "Commit message validation failed"

**Solution**:
```bash
# Amend last commit with correct format
git commit --amend

# Or use interactive commit
git reset HEAD~1
git add .
npm run commit
```

### CI Failing on Feature Branch

**Check workflow logs for specific failure**:
- **Linting**: `npm run lint:fix`
- **Tests**: `npm run test`
- **Formatting**: `npm run format`
- **Build**: Check TypeScript errors

---

## Best Practices

### DO:
✅ Push to feature branches frequently  
✅ Use `npm run commit` for commits  
✅ Wait for CI to pass before requesting review  
✅ Review workflow summaries on PRs  
✅ Let automatic releases handle versioning  
✅ Test locally before pushing: `npm run check`  

### DON'T:
❌ Skip commit message validation  
❌ Force push to main  
❌ Manually edit version in package.json  
❌ Bypass status checks on PRs  
❌ Create releases manually (use workflow)  
❌ Push directly to main (use PRs)  

---

## Monitoring

### Check Workflow Status

**For a specific commit**:
```
GitHub → Commits → Click commit → View checks
```

**For all workflows**:
```
GitHub → Actions → Select workflow → View runs
```

### Workflow Badges

Add to README.md:

```markdown
[![CI](https://github.com/devgrid-inc/vs-code-extension/workflows/CI/badge.svg)](https://github.com/devgrid-inc/vs-code-extension/actions/workflows/ci.yml)
[![Release](https://github.com/devgrid-inc/vs-code-extension/workflows/Release/badge.svg)](https://github.com/devgrid-inc/vs-code-extension/actions/workflows/release.yml)
```

### Viewing Coverage Reports

**For a specific workflow run**:
```
GitHub → Actions → Select workflow run → Artifacts → coverage-report
```

**On Pull Requests**:
- Coverage summary automatically commented on PRs
- Shows percentage for statements, branches, functions, lines
- Link to full report in artifacts

---

## Cost Optimization

**GitHub Actions is free for public repositories**, but consider:

### Workflow Optimization
- Quick Check: ~2-3 minutes (runs on all branches)
- CI: ~15-20 minutes (matrix of 6 jobs)
- Release: ~5-10 minutes (only on main)
- Total per feature branch push: ~5-10 minutes

### Reduce CI Matrix (if needed)
```yaml
# Only test on Ubuntu + Node 20 for feature branches
strategy:
  matrix:
    os: ${{ github.ref == 'refs/heads/main' && fromJSON('["ubuntu-latest", "macos-latest", "windows-latest"]') || fromJSON('["ubuntu-latest"]') }}
    node-version: ${{ github.ref == 'refs/heads/main' && fromJSON('[18, 20]') || fromJSON('[20]') }}
```

---

## Future Enhancements

### Planned
- [ ] Automated changelog generation in releases
- [ ] Automated npm package publishing
- [ ] Performance regression testing
- [ ] Visual regression testing
- [ ] Dependency vulnerability scanning
- [ ] Automated GitHub release notes

### Optional Integrations
- [ ] Slack notifications
- [ ] Discord notifications  
- [ ] Email on release
- [ ] Automated social media posts

---

## Support

For issues with CI/CD:
1. Check workflow logs in Actions tab
2. Review this guide
3. Open issue with `ci/cd` label
4. Contact DevOps team

---

**Last updated**: October 31, 2025  
**Maintained by**: DevGrid Team

