import type { DevGridFileConfig, DevGridIdentifiers } from '../types';

/**
 * DevGrid context interface
 */
export interface DevGridContext {
  workspaceFolder: { uri: { fsPath: string }; name: string };
  repositoryRoot?: string;
  configPath?: string;
  config?: DevGridFileConfig;
  identifiers: DevGridIdentifiers;
  apiBaseUrl: string;
  endpoints: Record<string, string>;
}

/**
 * Interface for configuration loading operations
 */
export interface IConfigLoader {
  /**
   * Loads and normalizes DevGrid configuration from the workspace
   * @param outputChannel - Optional output channel for logging
   * @returns Promise resolving to the loaded configuration or undefined if not found
   */
  loadConfig(outputChannel?: {
    appendLine: (message: string) => void;
  }): Promise<DevGridFileConfig | undefined>;

  /**
   * Normalizes identifiers from configuration
   * @param config - The configuration to normalize identifiers from
   * @param outputChannel - Optional output channel for logging
   * @returns Normalized identifiers
   */
  normalizeIdentifiers(
    config: DevGridFileConfig,
    outputChannel?: { appendLine: (message: string) => void }
  ): DevGridIdentifiers;

  /**
   * Loads DevGrid context including configuration and identifiers
   * @param outputChannel - Optional output channel for logging
   * @returns Promise resolving to the DevGrid context or undefined if not found
   */
  loadDevGridContext(outputChannel?: {
    appendLine: (message: string) => void;
  }): Promise<DevGridContext | undefined>;
}
