# Privacy Policy for DevGrid VS Code Extension

**Last Updated:** October 31, 2025

## Overview

The DevGrid VS Code Extension ("the Extension") is designed to provide engineering operations insights directly within Visual Studio Code. This privacy policy explains what data is collected, how it's used, and your rights regarding your data.

## Data Collection

### What Data We Collect

The Extension collects and processes the following information:

1. **Authentication Data**
   - OAuth 2.0 tokens (stored securely in VS Code's encrypted secret storage)
   - User email and account identifiers (from DevGrid authentication)
   - Access and refresh tokens for API communication

2. **Repository Information**
   - Git repository remote URLs
   - Branch names
   - Repository identifiers (for entity resolution)

3. **API Request Data**
   - GraphQL queries sent to DevGrid API
   - API endpoint configurations
   - Request timestamps and response metadata

4. **Configuration Data**
   - User settings (API endpoints, display preferences, logging levels)
   - `devgrid.yaml` configuration file contents (if present)
   - Custom entity identifiers

### What Data We DO NOT Collect

The Extension does **NOT** collect:

- ❌ Source code or file contents
- ❌ Personal files or documents
- ❌ Browsing history or editor usage patterns
- ❌ Keystroke data or editor telemetry
- ❌ Information from other extensions
- ❌ System information or hardware details

## How Data Is Used

### Primary Uses

1. **Authentication**: OAuth tokens authenticate your requests to the DevGrid API
2. **Entity Resolution**: Repository information maps your workspace to DevGrid entities
3. **Data Display**: API responses populate the DevGrid Insights tree view
4. **Configuration**: Settings control extension behavior and API communication

### Data Storage

- **Local Storage**: All data is stored locally on your machine
- **Secure Storage**: Authentication tokens use VS Code's encrypted secret storage
- **Cache**: API responses cached locally for 5 minutes to reduce API calls
- **No Cloud Storage**: The extension does not store data in any cloud service

## Data Sharing

### With DevGrid Services

The Extension communicates exclusively with DevGrid API endpoints:
- Default: `https://prod.api.devgrid.io`
- Configurable via extension settings

Data sent to DevGrid:
- Authentication tokens
- Repository identifiers
- GraphQL queries for vulnerabilities, incidents, and dependencies

### With Third Parties

The Extension does **NOT** share data with any third-party services except:
- DevGrid API (required for functionality)
- No analytics providers
- No advertising networks
- No data brokers

## Your Rights

### Data Access

- All data is stored locally on your machine
- You can view stored tokens via VS Code Developer Tools
- Configuration files are plain text in your workspace

### Data Deletion

You can delete your data at any time:

1. **Clear Extension Data**:
   - Run command: "DevGrid: Clear Cache"
   - Clears all cached API responses

2. **Remove Authentication**:
   - Run command: "DevGrid: Sign Out"
   - Removes stored OAuth tokens

3. **Uninstall Extension**:
   - Uninstalling removes all extension data
   - VS Code removes secret storage automatically

### Data Portability

- Configuration files (`devgrid.yaml`) are plain text and portable
- No proprietary data formats used
- Easy migration between machines

## Security Measures

### Token Security

- OAuth tokens stored in VS Code's encrypted secret storage
- Tokens transmitted only over HTTPS
- No tokens logged or written to disk in plain text
- Automatic token refresh on expiration

### Network Security

- All API communication over HTTPS/TLS
- Request retry with exponential backoff
- Timeout controls to prevent hanging requests
- No insecure network fallbacks

### Code Security

- TypeScript strict mode for type safety
- Comprehensive input validation
- No eval() or dynamic code execution
- Regular dependency updates

## Children's Privacy

The Extension is designed for professional software developers and is not intended for use by children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy to reflect changes in:
- Extension functionality
- Data handling practices
- Legal requirements
- Security improvements

**Notification**: Changes will be communicated via:
- Updated PRIVACY.md in GitHub repository
- Extension changelog
- Marketplace listing updates

## Contact & Questions

### Support

- **Issues**: https://github.com/devgrid-inc/vs-code-extension/issues
- **Email**: support@devgrid.io
- **Documentation**: https://docs.devgrid.io

### Privacy Concerns

For privacy-specific questions or concerns:
- **Email**: privacy@devgrid.io
- **GitHub**: Open an issue with "Privacy" label

## Compliance

### GDPR (European Users)

Under GDPR, you have the right to:
- Access your data (stored locally)
- Delete your data (uninstall extension)
- Data portability (export configuration)
- Object to processing (don't use extension)

### CCPA (California Users)

Under CCPA, you have the right to:
- Know what data is collected (see above)
- Delete your data (uninstall extension)
- Opt-out of sale (we don't sell data)

## Open Source

The Extension is open source (MIT License):
- Source code: https://github.com/devgrid-inc/vs-code-extension
- Audit the code to verify data handling
- Report security issues via GitHub

## Data Retention

- **Authentication Tokens**: Until sign-out or token expiration
- **Cached Data**: 5 minutes or until cleared
- **Configuration**: Until extension uninstall
- **No Long-Term Storage**: No data retained after uninstall

## Third-Party Services

### DevGrid API

The Extension connects to DevGrid's API service:
- **Provider**: DevGrid, Inc.
- **Purpose**: Retrieve security and operational insights
- **Data Sent**: Authentication tokens, repository identifiers, queries
- **Privacy Policy**: https://devgrid.io/privacy

### VS Code Platform

The Extension uses VS Code APIs:
- **Provider**: Microsoft Corporation
- **Purpose**: Extension host environment
- **Data Handling**: Per VS Code privacy policy
- **Privacy Policy**: https://privacy.microsoft.com/privacystatement

## Consent

By installing and using the Extension, you consent to:
- Data collection as described in this policy
- Communication with DevGrid API
- Local data storage on your machine

You may withdraw consent at any time by uninstalling the Extension.

---

**Version**: 1.0.0  
**Effective Date**: October 31, 2025  
**Extension Version**: 0.0.1

For the most current version of this privacy policy, visit:
https://github.com/devgrid-inc/vs-code-extension/blob/main/PRIVACY.md

