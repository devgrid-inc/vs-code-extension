# Changelog

## [Unreleased]

### ✨ New Features

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

- **Professional Marketplace Presentation**
  - Enterprise-focused branding and messaging
  - Professional icon and banner assets
  - Comprehensive README with usage examples and troubleshooting
  - Security and privacy section highlighting enterprise readiness
  - MIT license and proper attribution

### 🔧 Technical Improvements

- **Architecture Refactoring**: Complete service layer refactoring for testability
  - Dependency injection container (`ServiceContainer`)
  - Interface-based services (`ILogger`, `IGraphQLClient`, `IHttpClient`)
  - Modular service classes (`VulnerabilityService`, `EntityResolver`, etc.)
  - Comprehensive unit test coverage (54 tests)

- **GraphQL Query Optimization**: Improved vulnerability data fetching
  - Dual-query approach for maximum compatibility
  - Efficient caching with TTL-based expiration
  - Better error handling and logging

- **Webview Architecture**: Enhanced panel management
  - Message passing system for user interactions
  - Responsive HTML/CSS with VS Code theming
  - Proper disposal and memory management

- **Development Experience**: Professional development setup
  - ESLint and Prettier configuration
  - Vitest testing framework with comprehensive mocks
  - TypeScript strict mode compliance
  - Build and packaging optimizations

### 🐛 Bug Fixes

- Fixed vulnerability ID parameter passing in tree item commands
- Improved authentication token refresh handling
- Enhanced error messages and user feedback
- Fixed GraphQL query parameter validation

### 📚 Documentation

- Complete README rewrite with enterprise focus
- Added troubleshooting section
- Comprehensive command reference
- Security and privacy documentation
- Development and contribution guidelines

## 0.0.1 (Initial Release)

- DevGrid insights tree view integration
- Status bar synchronization indicators
- OAuth-based authentication with secure token storage
- Configurable API endpoints via `devgrid.yaml`
- Repository, component, and application metadata display
- Basic vulnerability, incident, and dependency listings
- Git remote auto-detection for repository linking
