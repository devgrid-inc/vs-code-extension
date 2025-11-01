# 🚀 Semantic Versioning Quick Start

**TL;DR**: Use `npm run commit` for commits, `npm run release` for releases.

## For Developers

### Making Commits

**Interactive (Recommended):**

```bash
git add .
npm run commit
```

Follow the prompts to create a perfect conventional commit.

**Manual:**

```bash
git add .
git commit -m "feat: your feature description"
git commit -m "fix: your bug fix description"
```

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature (bumps MINOR)
- `fix`: Bug fix (bumps PATCH)
- `docs`: Documentation
- `style`: Code formatting
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Tests
- `build`: Build system
- `ci`: CI/CD
- `chore`: Maintenance

**Breaking Changes:**
```bash
feat!: remove old API

BREAKING CHANGE: Old API removed, use new API
```

## For Maintainers

### Creating Releases

```bash
# 1. Check everything is clean
git status
npm run check

# 2. Create release (automatic version bump)
npm run release

# 3. Push to GitHub
git push --follow-tags origin main

# 4. Package and publish
npm run package
npm run publish
```

### Manual Version Control

```bash
npm run release:patch  # 0.0.1 → 0.0.2 (bug fixes)
npm run release:minor  # 0.0.1 → 0.1.0 (new features)
npm run release:major  # 0.0.1 → 1.0.0 (breaking changes)

npm run release:dry    # Preview without changes
```

## Full Documentation

- [VERSIONING.md](VERSIONING.md) - Complete guide
- [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) - Step-by-step process
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

## Examples

```bash
# Feature
git commit -m "feat(auth): add SSO support"

# Bug fix
git commit -m "fix(tree-view): resolve count display issue"

# Breaking change
git commit -m "feat(api)!: update to GraphQL v2

BREAKING CHANGE: All queries now require auth tokens"

# Documentation
git commit -m "docs(readme): add installation guide"
```

## Need Help?

Run the test to verify setup:
```bash
./scripts/test-commit-validation.sh
```

Read the full guide:
```bash
cat VERSIONING.md
```
