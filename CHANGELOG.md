# Changelog

All notable changes to the DevGrid VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - October 31, 2025

Initial release of the DevGrid VS Code Extension.

### ✨ New Features

- **DevGrid Insights Tree View**: Comprehensive view of vulnerabilities, incidents, and dependencies
  - Hierarchical display of security and operational insights
  - Severity-based organization (Critical, High, Medium, Low)
  - Context-aware entity resolution (repository, component, application)
  - Real-time synchronization with DevGrid platform

- **AI-Powered Vulnerability Analysis**: Added "Copy Instructions" and "Send to Chat" buttons to vulnerability details
  - Generate comprehensive remediation prompts for AI chat assistants
  - Intelligent chat provider detection (VS Code Chat, GitHub Copilot Chat)
  - Graceful fallback to clipboard when chat unavailable
  - Pre-filled prompts include CVSS scores, identifiers, affected packages, and remediation guidance

- **Enhanced Vulnerability Details**: Rich webview with comprehensive vulnerability information
  - Severity badges with color coding
  - CVSS scores and vector strings
  - Vulnerability identifiers (CVE, CWE, etc.)
  - Package information and version ranges
  - References and external links
  - Metadata including scan type, location, and dates

- **Authentication & Security**
  - OAuth 2.0 device flow authentication
  - Secure token storage via VS Code secrets API
  - Automatic token refresh
  - Sign in/out commands

- **Configuration Management**
  - Optional `devgrid.yaml` for custom entity identifiers
  - Configurable API endpoints
  - Auto-refresh settings (enabled by default, 5-minute interval)
  - Adjustable display limits (default: 100 items, max: 500)
  - Debug logging levels

- **Developer Commands**
  - Refresh insights manually
  - Clear cache
  - Pause/resume auto-refresh
  - Open settings
  - Open DevGrid dashboard
  - Create YAML template with auto-filled values
  - YAML setup guide

- **Keyboard Shortcuts**
  - `Ctrl+Shift+R Ctrl+Shift+D` (Windows/Linux) / `Cmd+Shift+R Cmd+Shift+D` (Mac) - Refresh insights

### 🔧 Technical Improvements

- **Architecture Refactoring**: Complete service layer refactoring for testability
  - Dependency injection container (`ServiceContainer`)
  - Interface-based services (`ILogger`, `IGraphQLClient`, `IHttpClient`)
  - Modular service classes (`VulnerabilityService`, `IncidentService`, `DependencyService`, `EntityResolver`)
  - Comprehensive unit test coverage (60+ tests)

- **Performance Optimizations**
  - 5-minute TTL caching for all API responses
  - Request deduplication
  - Configurable cache clearing
  - Optimized tree view rendering

- **GraphQL Client**: Type-safe GraphQL communication
  - Dual-query approach for maximum API compatibility
  - Efficient caching with TTL-based expiration
  - Retry logic with exponential backoff
  - Comprehensive error handling and logging

- **HTTP Client**: Robust network layer
  - Automatic retry with exponential backoff (3 retries default)
  - Configurable timeouts
  - Request/response logging for debugging

- **Webview Architecture**: Enhanced panel management
  - Message passing system for user interactions
  - Responsive HTML/CSS with VS Code theming
  - Proper disposal and memory management
  - Security-conscious content loading

- **Development Experience**: Professional development setup
  - ESLint and Prettier configuration
  - Vitest testing framework with comprehensive mocks
  - TypeScript strict mode compliance
  - Build and packaging optimizations
  - Pre-package validation script

### 📚 Documentation

- Comprehensive README with enterprise focus
- CONTRIBUTING.md with development guidelines
- Troubleshooting section
- Complete command reference
- Security and privacy documentation
- Architecture overview
- Testing guidelines

### 🛠️ Build & Tooling

- esbuild for fast compilation
- Production bundle minification
- Source maps for debugging
- Automated validation before packaging
- VS Code extension packaging with vsce

---

For more information, visit [DevGrid Documentation](https://docs.devgrid.io) or our [GitHub repository](https://github.com/devgrid-inc/vs-code-extension).
