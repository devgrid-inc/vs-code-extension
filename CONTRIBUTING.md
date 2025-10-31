# Contributing to DevGrid VS Code Extension

Thank you for your interest in contributing to the DevGrid VS Code Extension! This document provides guidelines and instructions for development.

## Table of Contents

- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Submitting Changes](#submitting-changes)
- [Troubleshooting](#troubleshooting)

## Development Setup

### Prerequisites

- Node.js 18.x or 20.x
- npm 9.x or later
- VS Code 1.85.0 or later
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devgrid-inc/vs-code-extension.git
   cd vs-code-extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run compile
   ```

### Running the Extension

1. **Open in VS Code:**
   ```bash
   code .
   ```

2. **Start debugging:**
   - Press `F5` or select "Run > Start Debugging"
   - This opens a new VS Code window with the extension loaded
   - The extension will reload automatically when you make changes

3. **View logs:**
   - Open the "DevGrid" output channel: View > Output > DevGrid
   - Set log level to `debug` in settings for detailed logs

## Architecture Overview

### Project Structure

```
vs-code-extension/
├── src/
│   ├── commands/          # Command implementations
│   ├── errors/            # Custom error classes
│   ├── interfaces/        # TypeScript interfaces
│   ├── services/          # Business logic services
│   ├── utils/             # Utility functions
│   ├── webviews/          # Webview panels
│   ├── extension.ts       # Extension entry point
│   └── types.ts           # Shared type definitions
├── scripts/               # Build and validation scripts
├── media/                 # Icons and images
└── dist/                  # Compiled output
```

### Key Components

#### Services

- **ServiceContainer**: Dependency injection container for all services
- **VulnerabilityService**: Fetches and caches vulnerability data
- **IncidentService**: Fetches and caches incident data
- **DependencyService**: Fetches and caches dependency data
- **EntityResolver**: Resolves Git repos to DevGrid entities
- **LoggerService**: Centralized logging with configurable levels
- **GraphQLClient**: Type-safe GraphQL client
- **HttpClient**: HTTP client with retry and error handling

#### Tree View

- **DevGridTreeDataProvider**: Main tree view provider
- Displays vulnerabilities, incidents, and dependencies
- Supports refresh, filtering, and detail views

#### Authentication

- **DevGridAuthProvider**: VS Code authentication provider
- **AuthService**: Authentication state management
- Uses OAuth 2.0 device flow for secure authentication

### Data Flow

1. User signs in → AuthService stores token in VS Code secrets
2. Extension activates → ServiceContainer initializes services
3. EntityResolver maps Git repo → DevGrid entities
4. Services fetch data from GraphQL API → cached for 5 minutes
5. TreeDataProvider displays data → user interacts
6. Auto-refresh updates data every 5 minutes (configurable)

## Development Workflow

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes:**
   ```bash
   npm run lint          # Run linter
   npm run test:run      # Run tests
   npm run compile       # Build extension
   ```

4. **Debug in VS Code:**
   - Press `F5` to launch extension development host
   - Test all affected functionality
   - Check the DevGrid output channel for errors

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with TypeScript plugin
- **Formatting**: Prettier with default settings
- **Naming**: camelCase for variables, PascalCase for classes

Run quality checks:
```bash
npm run check  # Runs lint, tests, and format check
```

### Adding New Commands

1. **Add command to `package.json`:**
   ```json
   {
     "command": "devgrid.yourCommand",
     "title": "DevGrid: Your Command"
   }
   ```

2. **Add activation event:**
   ```json
   "activationEvents": [
     "onCommand:devgrid.yourCommand"
   ]
   ```

3. **Register command in `extension.ts`:**
   ```typescript
   vscode.commands.registerCommand('devgrid.yourCommand', async () => {
     // Implementation
   });
   ```

4. **Update validation script** if needed

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Writing Tests

- Place tests in `src/__tests__/` directory
- Use Vitest for testing framework
- Mock VS Code API using `src/__mocks__/vscode.ts`
- Aim for >80% coverage

Example test:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YourService } from '../services/YourService';

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    service = new YourService(/* deps */);
  });

  it('should do something', async () => {
    const result = await service.doSomething();
    expect(result).toBeDefined();
  });
});
```

### Testing the Packaged Extension

```bash
# Package the extension
npm run package

# Install in VS Code
code --install-extension devgrid-vscode-extension-0.0.1.vsix

# Or test manually:
# 1. Open Extensions view (Ctrl+Shift+X)
# 2. Click "..." menu
# 3. Select "Install from VSIX..."
# 4. Choose the .vsix file
```

## Code Quality

### Pre-commit Checks

Before committing, ensure:
- [ ] Code compiles without errors: `npm run compile`
- [ ] Tests pass: `npm run test:run`
- [ ] Linter passes: `npm run lint`
- [ ] Code is formatted: `npm run format`
- [ ] Package validates: `npm run validate`

Run all checks:
```bash
npm run check
```

### Code Review Checklist

- [ ] Code follows TypeScript best practices
- [ ] Error handling is comprehensive
- [ ] Logging is appropriate (debug, info, warn, error)
- [ ] Tests cover new functionality
- [ ] Documentation is updated
- [ ] No sensitive data in code
- [ ] Performance impact is minimal

## Submitting Changes

### Pull Request Process

1. **Update your branch:**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run final checks:**
   ```bash
   npm run check
   npm run validate
   ```

3. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

   Use conventional commit format:
   - `feat:` new feature
   - `fix:` bug fix
   - `docs:` documentation
   - `test:` tests
   - `refactor:` code refactoring
   - `perf:` performance improvement

4. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create pull request:**
   - Go to GitHub repository
   - Click "New Pull Request"
   - Fill in description and link any issues
   - Request review

### PR Requirements

- All CI checks must pass
- At least one approval from maintainer
- No merge conflicts
- Documentation updated
- Changelog entry added (if applicable)

## Troubleshooting

### Common Issues

#### Extension Won't Activate

**Symptoms:** Extension doesn't load, no DevGrid view

**Solutions:**
1. Check Output > DevGrid for errors
2. Verify `dist/extension.js` exists: `npm run compile`
3. Check activation events in `package.json`
4. Reload VS Code window

#### TypeScript Compilation Errors

**Symptoms:** Build fails with type errors

**Solutions:**
1. Clean and rebuild: `rm -rf dist && npm run compile`
2. Update dependencies: `npm install`
3. Check TypeScript version: `npm list typescript`

#### Tests Failing

**Symptoms:** `npm test` reports failures

**Solutions:**
1. Update snapshots if needed: `npm run test:run -- -u`
2. Clear test cache: `rm -rf node_modules/.vitest`
3. Check mock implementations in `src/__mocks__/`

#### Authentication Not Working

**Symptoms:** Sign in fails or token invalid

**Solutions:**
1. Check `src/config.json` for OAuth settings
2. Verify API base URL in settings
3. Clear stored tokens: Sign Out then Sign In again
4. Check network connectivity

#### GraphQL Queries Failing

**Symptoms:** API calls return errors

**Solutions:**
1. Verify API endpoint is correct
2. Check authentication token is valid
3. Enable debug logging to see full queries
4. Verify schema matches API

### Getting Help

- **Issues:** https://github.com/devgrid-inc/vs-code-extension/issues
- **Discussions:** https://github.com/devgrid-inc/vs-code-extension/discussions
- **Docs:** https://docs.devgrid.io

### Debug Logging

Enable debug logging for detailed information:

1. Open VS Code Settings
2. Search for "DevGrid"
3. Set "Logging: Level" to "debug"
4. View Output > DevGrid

This shows:
- All API calls and responses
- Service lifecycle events
- Cache hits/misses
- Authentication flows

## Architecture Decisions

### Why Service Container?

We use dependency injection to:
- Improve testability
- Reduce coupling
- Enable service reuse
- Simplify mocking

### Why Caching?

API responses are cached for 5 minutes to:
- Reduce API load
- Improve performance
- Enable offline browsing
- Minimize rate limiting

### Why Not Use GraphQL Code Generator?

Currently on roadmap (Phase 2). Manual types provide:
- Faster iteration during MVP
- Simpler build process
- Type safety where needed

Will be added for better type safety and validation.

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [DevGrid API Documentation](https://docs.devgrid.io/api)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

