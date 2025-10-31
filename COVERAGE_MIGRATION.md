# Coverage Tracking Migration

## What Changed

We've migrated from third-party coverage tracking (Codecov) to GitHub's native artifact storage for improved security and privacy.

### Before (Codecov)
- ❌ Coverage data sent to third-party service
- ❌ Required external account and token
- ❌ Potential security risk for sensitive code
- ❌ Additional external dependency

### After (GitHub Artifacts)
- ✅ Coverage data stays within GitHub
- ✅ No external accounts or tokens needed
- ✅ Secure and private
- ✅ No additional dependencies
- ✅ Free with GitHub Actions

## Features

### 1. Automatic PR Comments
When you create a PR, a bot automatically comments with coverage summary:

```
📊 Code Coverage Report

| Metric      | Coverage | Status |
|-------------|----------|--------|
| Statements  | 85.2%    | ✅     |
| Branches    | 78.4%    | ⚠️     |
| Functions   | 82.1%    | ✅     |
| Lines       | 84.9%    | ✅     |

📁 Full coverage report available in workflow artifacts

---
Coverage data is stored securely in GitHub Actions artifacts (30-day retention)
```

### 2. Workflow Summaries
Every CI run shows coverage table in the workflow summary.

### 3. Downloadable Reports
Full HTML coverage reports available as artifacts (30-day retention).

## How to View Coverage

### Local Development
```bash
npm run test:coverage
open coverage/index.html
```

### On GitHub
1. Go to **Actions** tab
2. Select a workflow run
3. Scroll to **Artifacts**
4. Download **coverage-report**
5. Extract and open `index.html`

### On Pull Requests
Coverage automatically commented by GitHub bot.

## Benefits for DevGrid

As a security-focused extension, keeping coverage data internal is important:

1. **No code structure exposure** - Coverage reports can reveal code organization
2. **Compliance** - Easier to meet security/privacy requirements
3. **Control** - Full ownership of all testing data
4. **Simplicity** - One less external service to manage
5. **Cost** - No additional costs or usage limits

## Migration Impact

- ✅ **Zero breaking changes** - All existing functionality preserved
- ✅ **Better privacy** - No data leaves GitHub
- ✅ **Simpler setup** - No tokens to configure
- ✅ **Same visibility** - Coverage still tracked and displayed

## Questions?

See `docs/CI_CD_PIPELINE_GUIDE.md` for complete documentation.

---

**Migration Date**: October 31, 2025  
**Reason**: Enhanced security and privacy for DevGrid extension
