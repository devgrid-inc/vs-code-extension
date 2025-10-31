import * as fs from 'fs';
import * as path from 'path';

import * as yaml from 'js-yaml';
import * as vscode from 'vscode';

import { ConfigurationError, ValidationError } from '../errors/DevGridError';
import type { IConfigLoader, DevGridContext } from '../interfaces/IConfigLoader';
import type { ILogger } from '../interfaces/ILogger';
import type { DevGridFileConfig, DevGridIdentifiers } from '../types';

/**
 * Configuration service implementation
 */
export class ConfigService implements IConfigLoader {
  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(private logger: ILogger) {}

  /**
   * Loads and normalizes DevGrid configuration from the workspace
   */
  async loadConfig(_outputChannel?: { appendLine: (message: string) => void }): Promise<DevGridFileConfig | undefined> {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      this.logger.debug('No workspace folder found');
      return undefined;
    }

    const configPath = this.findConfigFile(workspaceFolder);
    if (!configPath) {
      this.logger.debug('No devgrid.yaml file found in workspace');
      return undefined;
    }

    try {
      const configContent = await this.readConfigFile(configPath);
      const config = this.parseConfigFile(configContent);
      
      this.logger.info('Configuration loaded successfully', {
        path: configPath,
        hasIdentifiers: !!config.identifiers,
        hasProject: !!config.project,
        hasEndpoints: !!config.endpoints,
      });

      return config;
    } catch (error) {
      this.logger.error('Failed to load configuration', error as Error, { path: configPath });
      throw new ConfigurationError(`Failed to load configuration from ${configPath}`, {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Normalizes identifiers from configuration
   */
  normalizeIdentifiers(
    config: DevGridFileConfig,
    outputChannel?: { appendLine: (message: string) => void }
  ): DevGridIdentifiers {
    const identifiers: DevGridIdentifiers = {};

    const normalizeString = (value: unknown): string | undefined => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      if (typeof value === 'number') {
        return String(value);
      }
      return undefined;
    };

    // Helper function to set value if not already set
    const setIfEmpty = (key: keyof DevGridIdentifiers, value: unknown) => {
      const normalized = normalizeString(value);
      if (normalized && !identifiers[key]) {
        identifiers[key] = normalized;
      }
    };

    // Helper function to get value with fallback
    const fallback = (getter: (cfg: DevGridFileConfig) => unknown) => {
      try {
        return getter(config);
      } catch {
        return undefined;
      }
    };

    // Load from identifiers section
    if (config.identifiers) {
      setIfEmpty('repositoryId', config.identifiers.repositoryId);
      setIfEmpty('componentSlug', config.identifiers.componentSlug);
      setIfEmpty('componentId', config.identifiers.componentId);
      setIfEmpty('applicationSlug', config.identifiers.applicationSlug);
      setIfEmpty('applicationId', config.identifiers.applicationId);
    }

    // Load from root level (legacy support)
    setIfEmpty('repositoryId', fallback(cfg => cfg.repositoryId));
    setIfEmpty('componentSlug', fallback(cfg => cfg.componentSlug));
    setIfEmpty('componentId', fallback(cfg => cfg.componentId));
    setIfEmpty('applicationSlug', fallback(cfg => cfg.applicationSlug));
    setIfEmpty('applicationId', fallback(cfg => cfg.applicationId));

    setIfEmpty('repositoryId', fallback(cfg => cfg['repository_id']));
    setIfEmpty('componentSlug', fallback(cfg => cfg['component_slug']));
    setIfEmpty('componentId', fallback(cfg => cfg['component_id']));
    setIfEmpty('applicationSlug', fallback(cfg => cfg['application_slug']));
    setIfEmpty('applicationId', fallback(cfg => cfg['application_id']));

    // Load from nested objects
    setIfEmpty('componentSlug', config.component?.slug);
    setIfEmpty('componentId', config.component?.id);
    const { application } = config;
    if (application) {
      setIfEmpty('applicationSlug', application.slug);
      setIfEmpty('applicationId', application.id);
    }

    // Handle project.appId (numeric values)
    const appId = config.project?.appId;
    if (appId !== undefined) {
      outputChannel?.appendLine(`[DevGrid:config] Found project.appId=${appId}`);
      setIfEmpty('applicationId', appId);
    }

    // Handle project.components selection
    if (config.project?.components && config.project.components.length > 0) {
      const selectedComponent = this.selectComponent(config.project.components);
      if (selectedComponent) {
        outputChannel?.appendLine(`[DevGrid:config] selected component=${selectedComponent.shortId} / ${selectedComponent.name}`);
        setIfEmpty('componentSlug', selectedComponent.shortId);
        setIfEmpty('componentId', selectedComponent.id);
      }
    }

    outputChannel?.appendLine(`[DevGrid:config] identifiers=${JSON.stringify(identifiers)}`);

    return identifiers;
  }

  /**
   * Loads DevGrid context including configuration and identifiers
   */
  async loadDevGridContext(outputChannel?: { appendLine: (message: string) => void }): Promise<DevGridContext | undefined> {
    const config = await this.loadConfig(outputChannel);
    if (!config) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }

    const identifiers = this.normalizeIdentifiers(config, outputChannel);
    const endpoints = this.extractEndpoints(config);
    
    return {
      workspaceFolder,
      config,
      identifiers,
      apiBaseUrl: config.apiBaseUrl || '',
      endpoints,
    };
  }

  /**
   * Extracts endpoints from configuration
   */
  private extractEndpoints(config: DevGridFileConfig): Record<string, string> {
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

  /**
   * Gets the current workspace folder
   */
  private getWorkspaceFolder(): string | undefined {
    // This would be injected in a real implementation
    // For now, we'll use a placeholder
    return process.cwd();
  }

  /**
   * Finds the devgrid.yaml file in the workspace
   */
  private findConfigFile(workspacePath: string): string | undefined {
    const possiblePaths = [
      path.join(workspacePath, 'devgrid.yaml'),
      path.join(workspacePath, 'devgrid.yml'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return undefined;
  }

  /**
   * Reads the configuration file
   */
  private async readConfigFile(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new ConfigurationError(`Failed to read configuration file: ${filePath}`, {
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Parses the configuration file content
   */
  private parseConfigFile(content: string): DevGridFileConfig {
    try {
      const config = yaml.load(content) as DevGridFileConfig;
      
      if (!config || typeof config !== 'object') {
        throw new ValidationError('Configuration file is empty or invalid');
      }

      return config;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new ConfigurationError('Failed to parse configuration file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Selects the appropriate component from the project components
   */
  private selectComponent(components: Array<{ shortId?: string; id?: string; name?: string; manifest?: string; api?: string }>): {
    shortId?: string;
    id?: string;
    name?: string;
  } | undefined {
    if (components.length === 0) {
      return undefined;
    }

    if (components.length === 1) {
      return components[0];
    }

    // Look for component with default attribute
    const defaultComponent = components.find(comp => 
      comp.manifest === 'package.json' || comp.api === 'swagger.yml'
    );

    if (defaultComponent) {
      return defaultComponent;
    }

    // Fall back to first component
    return components[0];
  }
}
