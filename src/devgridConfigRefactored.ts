import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import yaml from "js-yaml";
import {
  DevGridFileConfig,
  DevGridIdentifiers,
} from "./types";
import { getRemoteUrl, getRepositoryRoot } from "./gitUtils";
import type { ILogger } from "./interfaces/ILogger";

const CONFIG_FILE_CANDIDATES = ["devgrid.yaml", "devgrid.yml"];

export interface DevGridContext {
  workspaceFolder: vscode.WorkspaceFolder;
  repositoryRoot?: string;
  configPath?: string;
  config?: DevGridFileConfig;
  identifiers: DevGridIdentifiers;
  apiBaseUrl: string;
  endpoints: Record<string, string>;
}

/**
 * File system operations for DevGrid configuration
 */
export class DevGridConfigFileSystem {
  constructor(public logger: ILogger) {}

  /**
   * Checks if a file exists
   */
  async pathExists(candidate: string): Promise<boolean> {
    try {
      await fs.access(candidate);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Finds the DevGrid configuration file in the directory tree
   */
  async findConfigPath(start: string): Promise<string | undefined> {
    let current = path.normalize(start);
    const visited = new Set<string>();

    while (!visited.has(current)) {
      visited.add(current);

      for (const fileName of CONFIG_FILE_CANDIDATES) {
        const candidate = path.join(current, fileName);
        if (await this.pathExists(candidate)) {
          this.logger.debug('Found config file', { path: candidate });
          return candidate;
        }
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    this.logger.debug('No config file found', { startPath: start });
    return undefined;
  }

  /**
   * Reads and parses a YAML configuration file
   */
  async readConfigFile(configPath: string): Promise<DevGridFileConfig | undefined> {
    try {
      const content = await fs.readFile(configPath, "utf8");
      const config = yaml.load(content) as DevGridFileConfig;
      this.logger.debug('Loaded config file', { path: configPath, hasApiBaseUrl: !!config.apiBaseUrl });
      return config;
    } catch (error) {
      this.logger.error('Failed to read config file', error as Error, { path: configPath });
      return undefined;
    }
  }

  /**
   * Gets the repository root directory
   */
  async getRepositoryRoot(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
    try {
      return await getRepositoryRoot(workspaceFolder.uri.fsPath);
    } catch (error) {
      this.logger.debug('Failed to get repository root', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  /**
   * Gets the Git remote URL
   */
  async getRemoteUrl(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
    try {
      return await getRemoteUrl(workspaceFolder.uri.fsPath);
    } catch (error) {
      this.logger.debug('Failed to get remote URL', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }
}

/**
 * Configuration parser for DevGrid settings
 */
export class DevGridConfigParser {
  constructor(private logger: ILogger) {}

  /**
   * Normalizes identifiers from configuration
   */
  normalizeIdentifiers(
    config: DevGridFileConfig,
    options: { outputChannel?: vscode.OutputChannel }
  ): DevGridIdentifiers {
    const identifiers: DevGridIdentifiers = {};

    // Handle legacy flat structure
    if (config.identifiers) {
      Object.assign(identifiers, config.identifiers);
    }

    // Handle nested project structure
    if (config.project) {
      // Handle appId from project
      if (config.project.appId) {
        identifiers.applicationId = String(config.project.appId);
        this.logger.debug('Found appId in project', { appId: config.project.appId });
      }

      // Handle components
      if (config.project.components && config.project.components.length > 0) {
        const component = config.project.components[0]; // Use first component
        if (component.shortId) {
          identifiers.componentSlug = component.shortId;
          this.logger.debug('Found component shortId', { shortId: component.shortId });
        }
        if (component.name) {
          identifiers.componentSlug = identifiers.componentSlug || component.name;
        }
      }
    }

    // Handle nested application structure
    if (config.application) {
      if ((config.application as any).id) {
        identifiers.applicationId = (config.application as any).id;
        this.logger.debug('Found application id', { id: (config.application as any).id });
      }
      if ((config.application as any).slug) {
        identifiers.applicationSlug = (config.application as any).slug;
        this.logger.debug('Found application slug', { slug: (config.application as any).slug });
      }
    }

    // Handle nested component structure
    if (config.component) {
      if ((config.component as any).id) {
        identifiers.componentId = (config.component as any).id;
        this.logger.debug('Found component id', { id: (config.component as any).id });
      }
      if ((config.component as any).slug) {
        identifiers.componentSlug = (config.component as any).slug;
        this.logger.debug('Found component slug', { slug: (config.component as any).slug });
      }
    }

    // Handle nested repository structure
    if (config.repository) {
      if ((config.repository as any).slug) {
        identifiers.repositorySlug = (config.repository as any).slug;
        this.logger.debug('Found repository slug', { slug: (config.repository as any).slug });
      }
    }

    this.logger.debug('Normalized identifiers', { identifiers });
    return identifiers;
  }

  /**
   * Extracts endpoints from configuration
   */
  extractEndpoints(config: DevGridFileConfig): Record<string, string> {
    const endpoints: Record<string, string> = {};

    if (config.endpoints) {
      Object.assign(endpoints, config.endpoints);
    }

    // Add dashboard URL if available
    if (config.dashboardUrl) {
      endpoints.dashboardUrl = config.dashboardUrl as string;
    }

    return endpoints;
  }
}

/**
 * Main DevGrid configuration loader
 */
export class DevGridConfigLoader {
  private fileSystem: DevGridConfigFileSystem;
  private parser: DevGridConfigParser;

  constructor(logger: ILogger) {
    this.fileSystem = new DevGridConfigFileSystem(logger);
    this.parser = new DevGridConfigParser(logger);
  }

  /**
   * Loads DevGrid context for the current workspace
   */
  async loadDevGridContext(
    outputChannel: vscode.OutputChannel
  ): Promise<DevGridContext | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.fileSystem.logger.debug('No workspace folder found');
      return undefined;
    }

    this.fileSystem.logger.info('Loading DevGrid context', { workspaceFolder: workspaceFolder.name });

    // Find configuration file
    const configPath = await this.fileSystem.findConfigPath(workspaceFolder.uri.fsPath);
    if (!configPath) {
      this.fileSystem.logger.debug('No DevGrid configuration file found');
      return undefined;
    }

    // Read configuration
    const config = await this.fileSystem.readConfigFile(configPath);
    if (!config) {
      this.fileSystem.logger.warn('Failed to load configuration file', { path: configPath });
      return undefined;
    }

    // Get repository root
    const repositoryRoot = await this.fileSystem.getRepositoryRoot(workspaceFolder);

    // Normalize identifiers
    const identifiers = this.parser.normalizeIdentifiers(config, { outputChannel });

    // Extract endpoints
    const endpoints = this.parser.extractEndpoints(config);

    const context: DevGridContext = {
      workspaceFolder,
      repositoryRoot,
      configPath,
      config,
      identifiers,
      apiBaseUrl: config.apiBaseUrl || '',
      endpoints,
    };

    this.fileSystem.logger.info('DevGrid context loaded successfully', {
      hasApiBaseUrl: !!config.apiBaseUrl,
      hasIdentifiers: Object.keys(identifiers).length > 0,
      repositoryRoot: !!repositoryRoot,
    });

    return context;
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function loadDevGridContext(
  outputChannel: vscode.OutputChannel
): Promise<DevGridContext | undefined> {
  // Create a temporary logger for the legacy function
  const logger: ILogger = {
    trace: (message: string, meta?: Record<string, unknown>) => {
      outputChannel.appendLine(`[TRACE] ${message} ${meta ? JSON.stringify(meta) : ''}`);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      outputChannel.appendLine(`[DEBUG] ${message} ${meta ? JSON.stringify(meta) : ''}`);
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      outputChannel.appendLine(`[INFO] ${message} ${meta ? JSON.stringify(meta) : ''}`);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      outputChannel.appendLine(`[WARN] ${message} ${meta ? JSON.stringify(meta) : ''}`);
    },
    error: (message: string, error: Error, meta?: Record<string, unknown>) => {
      outputChannel.appendLine(`[ERROR] ${message} ${error.message} ${meta ? JSON.stringify(meta) : ''}`);
    },
    setLevel: () => {},
    getLevel: () => 'info' as any,
    child: () => logger,
  };

  const loader = new DevGridConfigLoader(logger);
  return loader.loadDevGridContext(outputChannel);
}
