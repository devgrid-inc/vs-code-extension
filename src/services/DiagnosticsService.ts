import * as vscode from 'vscode';

import type { ILogger } from '../interfaces/ILogger';
import type { DevGridVulnerability, DevGridVulnerabilityDetails } from '../types';

import type { VulnerabilityService } from './VulnerabilityService';

/**
 * Parsed location information from vulnerability location field
 */
interface ParsedLocation {
  filePath: string;
  line?: number;
  column?: number;
}

/**
 * Service that manages VS Code diagnostics for vulnerabilities and configuration issues
 */
export class DiagnosticsService {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor(
    private vulnerabilityService: VulnerabilityService,
    private logger: ILogger
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('devgrid');
  }

  /**
   * Updates diagnostics based on vulnerabilities
   */
  async updateDiagnostics(vulnerabilities: DevGridVulnerability[]): Promise<void> {
    this.logger.debug('Updating diagnostics', { count: vulnerabilities.length });

    // Clear existing diagnostics
    this.diagnosticCollection.clear();

    // Filter out closed/resolved vulnerabilities
    const activeVulnerabilities = vulnerabilities.filter(
      vuln =>
        !vuln.status ||
        (vuln.status.toLowerCase() !== 'closed' && vuln.status.toLowerCase() !== 'resolved')
    );

    if (activeVulnerabilities.length === 0) {
      this.logger.debug('No active vulnerabilities to display as diagnostics');
      return;
    }

    // Group diagnostics by file URI
    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

    // Fetch details for each vulnerability to get location and scanType
    const diagnosticsPromises = activeVulnerabilities.map(async vuln => {
      try {
        const details = await this.vulnerabilityService.fetchVulnerabilityDetails(vuln.id);
        if (!details) {
          return null;
        }

        return this.createDiagnosticsFromVulnerability(vuln, details);
      } catch (error) {
        this.logger.warn('Failed to fetch vulnerability details for diagnostics', {
          vulnerabilityId: vuln.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    const allDiagnostics = await Promise.all(diagnosticsPromises);

    // Collect all diagnostics by file
    for (const diagnostics of allDiagnostics) {
      if (!diagnostics) {
        continue;
      }

      for (const diagnosticTuple of diagnostics) {
        const uriString = diagnosticTuple[0];
        const diag = diagnosticTuple[1];

        const existingDiagnostics = diagnosticsByFile.get(uriString);
        if (!existingDiagnostics) {
          diagnosticsByFile.set(uriString, [diag]);
        } else {
          existingDiagnostics.push(diag);
        }
      }
    }

    // Set diagnostics for each file
    for (const [uriString, diagnostics] of diagnosticsByFile.entries()) {
      try {
        // uriString is already a proper URI string from fileUri.toString()
        const uri = vscode.Uri.parse(uriString);
        this.diagnosticCollection.set(uri, diagnostics);
        this.logger.debug('Set diagnostics for file', {
          file: uriString,
          count: diagnostics.length,
        });
      } catch (error) {
        this.logger.warn('Failed to set diagnostics for file', {
          uriString,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Diagnostics updated', {
      totalFiles: diagnosticsByFile.size,
      totalDiagnostics: Array.from(diagnosticsByFile.values()).reduce(
        (sum, diags) => sum + diags.length,
        0
      ),
    });
  }

  /**
   * Creates diagnostics from a vulnerability
   * Returns array of [uri, diagnostic] tuples
   */
  private async createDiagnosticsFromVulnerability(
    vulnerability: DevGridVulnerability,
    details: DevGridVulnerabilityDetails
  ): Promise<Array<[string, vscode.Diagnostic]> | null> {
    const isConfigurationIssue = this.isConfigurationIssue(details);
    const parsedLocation = this.parseLocation(details.location);

    let fileUri: string | null = null;

    // If we have a parsed location with a file path, try to resolve it
    if (parsedLocation) {
      this.logger.debug('Parsed location', {
        vulnerabilityId: vulnerability.id,
        filePath: parsedLocation.filePath,
        line: parsedLocation.line,
        column: parsedLocation.column,
      });

      fileUri = await this.resolveFileUri(parsedLocation.filePath);

      if (fileUri) {
        this.logger.debug('Resolved file URI', {
          vulnerabilityId: vulnerability.id,
          fileUri,
        });
      } else {
        this.logger.debug('Could not resolve file URI', {
          filePath: parsedLocation.filePath,
          vulnerabilityId: vulnerability.id,
        });
      }
    }

    // If no file location found, check if this is a package-level vulnerability
    // and try to map it to appropriate manifest file or workspace root
    if (!fileUri) {
      const hasPackageData = this.hasPackageData(details.location);

      if (hasPackageData) {
        // Use hybrid detection: try packageIdentifier first, then workspace scan
        fileUri = await this.resolvePackageManifest(details.location);

        if (fileUri) {
          this.logger.debug('Mapped package vulnerability to workspace file', {
            vulnerabilityId: vulnerability.id,
            fileUri,
          });
        } else {
          this.logger.debug('Could not resolve workspace root for package vulnerability', {
            vulnerabilityId: vulnerability.id,
          });
          return null;
        }
      } else {
        // No location and not a package vulnerability
        // For medium/high/critical severity, still show at workspace root
        const severity = details.severity?.toLowerCase() ?? '';
        const isHighSeverity =
          severity === 'critical' || severity === 'high' || severity === 'medium';

        if (isHighSeverity) {
          fileUri = await this.resolveWorkspaceRoot();

          if (fileUri) {
            this.logger.debug(
              'Mapped high-severity vulnerability without location to workspace root',
              {
                vulnerabilityId: vulnerability.id,
                severity,
                fileUri,
              }
            );
          } else {
            this.logger.debug('Could not resolve workspace root for high-severity vulnerability', {
              vulnerabilityId: vulnerability.id,
              severity,
            });
            return null;
          }
        } else {
          // Low severity or unknown - skip it if no location
          this.logger.debug('No valid location found for vulnerability (low severity)', {
            vulnerabilityId: vulnerability.id,
            severity,
            location: details.location,
            locationType: typeof details.location,
          });
          return null;
        }
      }
    }

    // Create diagnostic using parsed location if available, otherwise use default (line 0)
    const locationForDiagnostic = parsedLocation || { filePath: '', line: 0, column: 0 };
    const diagnostic = this.createDiagnostic(
      vulnerability,
      details,
      locationForDiagnostic,
      isConfigurationIssue
    );

    return [[fileUri, diagnostic]];
  }

  /**
   * Determines if a vulnerability is a configuration issue
   */
  private isConfigurationIssue(details: DevGridVulnerabilityDetails): boolean {
    // Check scanType for configuration-related keywords
    const scanType = details.scanType?.toLowerCase() ?? '';
    const configKeywords = ['config', 'configuration', 'infra', 'infrastructure', 'compliance'];

    for (const keyword of configKeywords) {
      if (scanType.includes(keyword)) {
        return true;
      }
    }

    // Check originatingSystem for configuration scanners
    const originatingSystem = details.originatingSystem?.toLowerCase() ?? '';
    const configSystems = ['checkov', 'tfsec', 'terrascan', 'kics', 'config', 'compliance'];

    for (const system of configSystems) {
      if (originatingSystem.includes(system)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parses location field (can be string or JSON)
   */
  private parseLocation(location: string | unknown): ParsedLocation | null {
    if (!location) {
      return null;
    }

    // If it's already a string, treat it as a file path
    if (typeof location === 'string') {
      return {
        filePath: location,
      };
    }

    // If it's an object, try to extract file path and line/column
    if (typeof location === 'object' && location != null) {
      const loc = location as Record<string, unknown>;

      // Check for nested nodes array structure (e.g., Checkmarx SAST format)
      if (Array.isArray(loc.nodes) && loc.nodes.length > 0) {
        const firstNode = loc.nodes[0] as Record<string, unknown> | null;
        if (firstNode && typeof firstNode === 'object') {
          const fileName =
            (typeof firstNode.fileName === 'string' ? firstNode.fileName : null) ||
            (typeof firstNode.file === 'string' ? firstNode.file : null) ||
            (typeof firstNode.path === 'string' ? firstNode.path : null);

          if (fileName) {
            // Remove leading /app/ or similar container paths
            const normalizedPath = fileName.replace(/^\/app\//, '').replace(/^\//, '');
            const line = typeof firstNode.line === 'number' ? firstNode.line : undefined;
            const column = typeof firstNode.column === 'number' ? firstNode.column : undefined;

            return {
              filePath: normalizedPath,
              line: line !== undefined ? line - 1 : undefined, // VS Code uses 0-based line numbers
              column: column !== undefined ? column - 1 : undefined, // VS Code uses 0-based column numbers
            };
          }
        }
      }

      // Try direct location object structures
      const filePath =
        (typeof loc.fileName === 'string' ? loc.fileName : null) ||
        (typeof loc.path === 'string' ? loc.path : null) ||
        (typeof loc.file === 'string' ? loc.file : null) ||
        (typeof loc.filePath === 'string' ? loc.filePath : null);

      if (filePath) {
        // Remove leading /app/ or similar container paths
        const normalizedPath = filePath.replace(/^\/app\//, '').replace(/^\//, '');

        const line =
          typeof loc.line === 'number'
            ? loc.line
            : typeof loc.lineNumber === 'number'
              ? loc.lineNumber
              : typeof loc.startLine === 'number'
                ? loc.startLine
                : undefined;

        const column =
          typeof loc.column === 'number'
            ? loc.column
            : typeof loc.columnNumber === 'number'
              ? loc.columnNumber
              : typeof loc.startColumn === 'number'
                ? loc.startColumn
                : undefined;

        return {
          filePath: normalizedPath,
          line: line !== undefined ? line - 1 : undefined, // VS Code uses 0-based line numbers
          column: column !== undefined ? column - 1 : undefined, // VS Code uses 0-based column numbers
        };
      }

      // If no file path found, return null (e.g., package-only vulnerabilities)
      return null;
    }

    return null;
  }

  /**
   * Resolves a file path to a VS Code URI
   */
  private async resolveFileUri(filePath: string): Promise<string | null> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return null;
    }

    // Normalize the path (handle both relative and absolute paths)
    const normalizedPath = filePath.replace(/^\//, ''); // Remove leading slash for relative paths

    // Try each workspace folder
    for (const folder of vscode.workspace.workspaceFolders) {
      // Try exact match first
      const exactUri = vscode.Uri.joinPath(folder.uri, normalizedPath);
      try {
        const stat = await vscode.workspace.fs.stat(exactUri);
        if (stat.type === vscode.FileType.File) {
          return exactUri.toString();
        }
      } catch {
        // File doesn't exist, try fuzzy matching
      }

      // Try fuzzy matching - search for files with similar names
      const fuzzyMatch = await this.findFileFuzzy(folder.uri, normalizedPath);
      if (fuzzyMatch) {
        return fuzzyMatch.toString();
      }
    }

    return null;
  }

  /**
   * Finds a file using fuzzy matching
   */
  private async findFileFuzzy(
    workspaceFolder: vscode.Uri,
    filePath: string
  ): Promise<vscode.Uri | null> {
    try {
      // Extract just the filename
      const fileName = filePath.split('/').pop() || filePath;

      // Search for files matching the name
      const pattern = new vscode.RelativePattern(workspaceFolder, `**/${fileName}`);
      const files = await vscode.workspace.findFiles(pattern, null, 1);

      if (files.length > 0) {
        return files[0];
      }
    } catch (error) {
      this.logger.debug('Fuzzy file matching failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Checks if location has package data (indicating a package-level vulnerability)
   */
  private hasPackageData(location: string | unknown): boolean {
    if (typeof location !== 'object' || location == null) {
      return false;
    }

    const loc = location as Record<string, unknown>;
    return (
      typeof loc.packageData !== 'undefined' ||
      typeof loc.packageIdentifier !== 'undefined' ||
      typeof loc.recommendedVersion !== 'undefined'
    );
  }

  /**
   * Detects package manager type from packageIdentifier
   * Examples: "Npm-canvg-3.0.10" -> "npm", "PyPI-requests-2.28.0" -> "python"
   */
  private detectPackageManagerFromIdentifier(location: string | unknown): string | null {
    if (typeof location !== 'object' || location == null) {
      return null;
    }

    const loc = location as Record<string, unknown>;
    const { packageIdentifier } = loc;

    if (typeof packageIdentifier !== 'string') {
      return null;
    }

    // Extract prefix before first hyphen (e.g., "Npm-" -> "npm")
    const prefixMatch = packageIdentifier.match(/^([A-Za-z]+)-/);
    if (!prefixMatch) {
      return null;
    }

    const prefix = prefixMatch[1].toLowerCase();

    // Map common prefixes to package manager types
    const prefixMap: Record<string, string> = {
      npm: 'npm',
      yarn: 'npm', // Yarn uses same manifest as npm
      pnpm: 'npm', // pnpm uses same manifest as npm
      pypi: 'python',
      gem: 'ruby',
      go: 'go',
      cargo: 'rust',
      maven: 'java-maven',
      gradle: 'java-gradle',
      composer: 'php',
      nuget: 'dotnet',
      docker: 'docker',
    };

    return prefixMap[prefix] || null;
  }

  /**
   * Maps package manager type to manifest file patterns (in priority order)
   */
  private getManifestFilesForPackageManager(packageManager: string): string[] {
    const manifestMap: Record<string, string[]> = {
      npm: ['package.json'],
      python: ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg'],
      ruby: ['Gemfile', 'Gemfile.lock'],
      go: ['go.mod', 'go.sum'],
      rust: ['Cargo.toml', 'Cargo.lock'],
      'java-maven': ['pom.xml'],
      'java-gradle': ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
      php: ['composer.json', 'composer.lock'],
      dotnet: ['*.csproj', '*.vbproj', 'packages.config', 'project.json'],
      docker: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
    };

    return manifestMap[packageManager] || [];
  }

  /**
   * Scans workspace for common manifest files
   * Returns first found manifest file
   */
  private async scanWorkspaceForManifestFiles(): Promise<string | null> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return null;
    }

    const folder = vscode.workspace.workspaceFolders[0];

    // List of common manifest files in order of likelihood
    const commonManifests = [
      'package.json', // npm/yarn/pnpm
      'requirements.txt', // Python pip
      'pyproject.toml', // Python poetry
      'go.mod', // Go
      'Cargo.toml', // Rust
      'pom.xml', // Java Maven
      'build.gradle', // Java Gradle
      'composer.json', // PHP
      'Gemfile', // Ruby
      'Pipfile', // Python pipenv
      'setup.py', // Python
    ];

    for (const manifest of commonManifests) {
      const uri = vscode.Uri.joinPath(folder.uri, manifest);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File) {
          this.logger.debug('Found manifest file in workspace', { manifest, uri: uri.toString() });
          return uri.toString();
        }
      } catch {
        // File doesn't exist, try next
      }
    }

    // Also check for .NET project files with glob pattern
    try {
      const dotnetPattern = new vscode.RelativePattern(folder, '**/*.csproj');
      const dotnetFiles = await vscode.workspace.findFiles(dotnetPattern, null, 1);
      if (dotnetFiles.length > 0) {
        this.logger.debug('Found .NET project file', { uri: dotnetFiles[0].toString() });
        return dotnetFiles[0].toString();
      }
    } catch (error) {
      this.logger.debug('Error searching for .NET files', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Check for Dockerfile
    try {
      const dockerPattern = new vscode.RelativePattern(folder, '**/Dockerfile*');
      const dockerFiles = await vscode.workspace.findFiles(dockerPattern, null, 1);
      if (dockerFiles.length > 0) {
        this.logger.debug('Found Dockerfile', { uri: dockerFiles[0].toString() });
        return dockerFiles[0].toString();
      }
    } catch (error) {
      this.logger.debug('Error searching for Dockerfile', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Resolves package manifest file using hybrid detection:
   * 1. Try to detect from packageIdentifier
   * 2. Fall back to scanning workspace
   * 3. Fall back to workspace root
   */
  private async resolvePackageManifest(location: string | unknown): Promise<string | null> {
    // Try to detect package manager from packageIdentifier
    const packageManager = this.detectPackageManagerFromIdentifier(location);

    if (packageManager) {
      this.logger.debug('Detected package manager from identifier', { packageManager });
      const manifestFiles = this.getManifestFilesForPackageManager(packageManager);

      // Try each manifest file in priority order
      for (const manifestFile of manifestFiles) {
        // Handle glob patterns (e.g., *.csproj)
        if (manifestFile.includes('*')) {
          if (
            !vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0
          ) {
            continue;
          }

          const folder = vscode.workspace.workspaceFolders[0];
          const pattern = new vscode.RelativePattern(folder, manifestFile);

          try {
            const files = await vscode.workspace.findFiles(pattern, null, 1);
            if (files.length > 0) {
              this.logger.debug('Found manifest file via package manager detection', {
                packageManager,
                manifestFile,
                uri: files[0].toString(),
              });
              return files[0].toString();
            }
          } catch (error) {
            this.logger.debug('Error searching for manifest with glob pattern', {
              manifestFile,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          // Simple file path
          const fileUri = await this.resolveFileUri(manifestFile);
          if (fileUri) {
            this.logger.debug('Found manifest file via package manager detection', {
              packageManager,
              manifestFile,
              fileUri,
            });
            return fileUri;
          }
        }
      }

      this.logger.debug('Package manager detected but no manifest file found', {
        packageManager,
        triedFiles: manifestFiles,
      });
    }

    // Fall back to scanning workspace for common manifest files
    const scannedManifest = await this.scanWorkspaceForManifestFiles();
    if (scannedManifest) {
      this.logger.debug('Found manifest file via workspace scan', { uri: scannedManifest });
      return scannedManifest;
    }

    // Final fallback to workspace root
    return await this.resolveWorkspaceRoot();
  }

  /**
   * Resolves a workspace root file for diagnostics
   * Returns a virtual document URI for vulnerabilities with unknown locations
   */
  private async resolveWorkspaceRoot(): Promise<string | null> {
    // Use virtual document URI instead of searching for real files
    // This prevents diagnostics from being randomly attached to README.md or other root files
    return vscode.Uri.parse(
      'devgrid:DevGrid Tracked Vulnerability - Ambiguous Location'
    ).toString();
  }

  /**
   * Creates a VS Code Diagnostic from vulnerability details
   */
  private createDiagnostic(
    vulnerability: DevGridVulnerability,
    details: DevGridVulnerabilityDetails,
    location: ParsedLocation,
    isConfigurationIssue: boolean
  ): vscode.Diagnostic {
    // Build diagnostic message
    const prefix = isConfigurationIssue ? '[Config] ' : '';
    const message = `${prefix}${vulnerability.title}`;

    // Create range
    const range = this.createRange(location);

    // Map severity to VS Code DiagnosticSeverity
    const severity = this.mapSeverity(details.severity);

    const diagnostic = new vscode.Diagnostic(range, message, severity);

    // Add source identifier
    diagnostic.source = 'DevGrid';

    // Add code (vulnerability ID) for tracking
    diagnostic.code = vulnerability.id;

    // Add related information if available
    if (details.description) {
      diagnostic.message += `\n\n${details.description}`;
    }

    return diagnostic;
  }

  /**
   * Creates a VS Code Range from parsed location
   */
  private createRange(location: ParsedLocation): vscode.Range {
    const line = location.line ?? 0;
    const startColumn = location.column ?? 0;

    // If we have line/column info, create a range for that position
    // Otherwise, create a range for the entire first line
    if (location.line !== undefined || location.column !== undefined) {
      return new vscode.Range(line, startColumn, line, startColumn + 1);
    }

    // Default to first character of first line
    return new vscode.Range(0, 0, 0, 1);
  }

  /**
   * Maps DevGrid severity to VS Code DiagnosticSeverity
   */
  private mapSeverity(severity?: string): vscode.DiagnosticSeverity {
    if (!severity) {
      return vscode.DiagnosticSeverity.Information;
    }

    const severityLower = severity.toLowerCase();

    switch (severityLower) {
      case 'critical':
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
      case 'info':
      case 'informational':
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  /**
   * Clears all diagnostics
   */
  clear(): void {
    this.diagnosticCollection.clear();
    this.logger.debug('Diagnostics cleared');
  }

  /**
   * Disposes of the diagnostic collection
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
    this.logger.debug('Diagnostics service disposed');
  }
}
