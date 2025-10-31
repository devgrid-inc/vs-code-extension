# Changelog

All notable changes to the DevGrid VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-10-31

### ✨ New Features

#### Core Functionality
- **Tree View Integration**: Display vulnerabilities, incidents, and dependencies in VS Code sidebar
- **Authentication**: OAuth 2.0 device flow integration with DevGrid platform
- **Vulnerability Details**: Rich webview panel with comprehensive vulnerability information
- **YAML Configuration**: Interactive setup guide and template generation for `devgrid.yaml`
- **Auto-Refresh**: Configurable automatic data refresh with pause/resume controls
- **Cache Management**: Manual cache clearing with per-service invalidation
- **Status Bar**: Real-time connection status and quick actions

#### Commands
- `devgrid.refresh` - Manually refresh DevGrid insights
- `devgrid.openSettings` - Open extension settings
- `devgrid.openDashboard` - Open DevGrid web dashboard
- `devgrid.signIn` - Sign in to DevGrid
- `devgrid.signOut` - Sign out from DevGrid
- `devgrid.showAccount` - Display current account information
- `devgrid.openVulnerability` - Open vulnerability details panel
- `devgrid.openSetupGuide` - Open YAML setup guide webview
- `devgrid.createYamlTemplate` - Create `devgrid.yaml` template in workspace
- `devgrid.clearCache` - Clear all cached data
- `devgrid.pauseAutoRefresh` - Pause automatic refresh
- `devgrid.resumeAutoRefresh` - Resume automatic refresh

#### Configuration Options
- `devgrid.autoRefresh.enabled` - Enable/disable auto-refresh (default: true)
- `devgrid.autoRefresh.intervalMinutes` - Refresh interval in minutes (default: 5)
- `devgrid.maxItemsPerSection` - Maximum items to display per section (default: 100, max: 500)
- `devgrid.showStatusBarItem` - Show/hide status bar item (default: true)
- `devgrid.debug` - Enable debug logging (default: false)

### 🔧 Technical Improvements

#### Architecture
- **Service Container**: Centralized dependency injection with service lifecycle management
- **GraphQL Client**: Type-safe GraphQL queries with error handling
- **HTTP Client**: Abstracted HTTP layer with retry logic
- **Entity Resolution**: Automatic repository detection and entity resolution
- **Caching**: In-memory caching with 5-minute TTL for all services
- **Error Handling**: Custom error classes with structured error messages
- **Logging**: Structured logging with log levels and output channel integration

#### Data Services
- **VulnerabilityService**: Fetch and cache vulnerability data with details
- **IncidentService**: Fetch and cache incident data
- **DependencyService**: Fetch and cache dependency data (API pending)
- **EntityResolver**: Resolve Git repository to DevGrid entity
- **GitService**: Git operations and remote URL extraction

#### UI Components
- **DevGridTreeDataProvider**: Tree view with collapsible sections and icons
- **VulnerabilityDetailsPanel**: Rich HTML webview with CVSS scores, remediation, and references
- **DevGridSetupPanel**: Interactive setup guide with step-by-step instructions
- **DiagnosticsService**: Problem panel integration for high/critical vulnerabilities

#### Quality Assurance
- **Unit Tests**: Comprehensive test coverage with Vitest
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier for consistent code style
- **Type Safety**: Full TypeScript with strict mode
- **Validation**: Pre-package validation script
- **CI/CD**: GitHub Actions for testing and building

### 📚 Documentation
- **README.md**: Comprehensive installation and usage guide
- **CHANGELOG.md**: Detailed version history
- **CONTRIBUTING.md**: Contribution guidelines and development setup
- **PRIVACY.md**: Privacy and security policy
- **VERSIONING.md**: Semantic versioning and release guide
- **LICENSE**: MIT License

### 🔐 Privacy & Security
- No data collection or telemetry
- Secure authentication with VS Code Secrets API
- Local data processing only
- HTTPS-only API communication
- Open-source and auditable

### 🛠️ Developer Experience
- **Interactive Commits**: Commitizen for standardized commit messages
- **Commit Validation**: Commitlint configuration for conventional commits
- **Automated Versioning**: standard-version for semantic versioning and changelog
- **Keyboard Shortcuts**: `Ctrl+Shift+R Ctrl+Shift+D` (Mac: `Cmd+Shift+R Cmd+Shift+D`) for refresh

### 📦 Package Information
- **Publisher**: devgrid-inc
- **Name**: devgrid-vscode-extension
- **Display Name**: DevGrid Security Insights
- **Version**: 0.0.1
- **Engine**: VS Code ^1.85.0
- **License**: MIT
- **Repository**: https://github.com/devgrid-inc/vs-code-extension

### 🐛 Known Limitations
- Dependencies API not yet available in GraphQL schema
- Maximum 500 items per section (performance constraint)
- Auto-refresh requires active authentication session

### 🔮 Future Enhancements
- Search and filtering capabilities
- GraphQL code generation for type safety
- Monitoring and telemetry (opt-in)
- Token refresh automation
- Vulnerability trending and analytics

---

## Release History

All releases follow [Semantic Versioning](https://semver.org/).

For detailed commit history, see [GitHub Releases](https://github.com/devgrid-inc/vs-code-extension/releases).
