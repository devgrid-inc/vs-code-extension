import { promises as fs } from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import * as vscode from 'vscode';

import { getRepositoryRoot } from '../gitUtils';
import type { DevGridFileConfig } from '../types';

const CONFIG_FILE_CANDIDATES = ['devgrid.yaml', 'devgrid.yml'];

export interface YamlValidationResult {
  isValid: boolean;
  exists: boolean;
  configPath?: string;
  config?: DevGridFileConfig;
  errors: string[];
  warnings: string[];
}

/**
 * Checks if a YAML config file exists in the workspace
 */
export async function findYamlConfigPath(
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<string | undefined> {
  if (!workspaceFolder) {
    return undefined;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const repositoryRoot = await getRepositoryRoot(workspacePath);
  const projectRoot = repositoryRoot ?? workspacePath;

  return findConfigPathRecursive(projectRoot);
}

/**
 * Recursively searches for config file from a starting directory
 */
async function findConfigPathRecursive(start: string): Promise<string | undefined> {
  let current = path.normalize(start);
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);

    for (const fileName of CONFIG_FILE_CANDIDATES) {
      const candidate = path.join(current, fileName);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // File doesn't exist, continue
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return undefined;
}

/**
 * Validates a DevGrid YAML configuration file
 */
export async function validateYamlConfig(configPath: string): Promise<YamlValidationResult> {
  const result: YamlValidationResult = {
    isValid: false,
    exists: false,
    errors: [],
    warnings: [],
  };

  // Check if file exists
  try {
    await fs.access(configPath);
    result.exists = true;
    result.configPath = configPath;
  } catch {
    result.errors.push(`Config file not found: ${configPath}`);
    return result;
  }

  // Try to read and parse the file
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = yaml.load(raw) as DevGridFileConfig | undefined;

    if (!parsed || typeof parsed !== 'object') {
      result.errors.push('Configuration file is empty or invalid');
      return result;
    }

    result.config = parsed;

    // Validate minimum required structure
    if (!parsed.project) {
      result.errors.push('Missing required "project" section');
    } else {
      // Validate project structure
      if (!parsed.project.appId) {
        result.warnings.push('Project "appId" is missing (recommended)');
      }

      if (!parsed.project.components || !Array.isArray(parsed.project.components)) {
        result.errors.push('Project must have at least one "component" in "components" array');
      } else if (parsed.project.components.length === 0) {
        result.errors.push('Project "components" array cannot be empty');
      } else {
        // Validate each component
        parsed.project.components.forEach((component, index) => {
          if (!component.name) {
            result.warnings.push(`Component at index ${index} is missing "name"`);
          }
          if (!component.shortId) {
            result.warnings.push(`Component at index ${index} is missing "shortId"`);
          }
          if (!component.manifest) {
            result.warnings.push(
              `Component at index ${index} is missing "manifest" (e.g., package.json, pom.xml)`
            );
          }
        });
      }
    }

    // If no critical errors, mark as valid
    if (result.errors.length === 0) {
      result.isValid = true;
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}

/**
 * Validates YAML configuration for the current workspace
 */
export async function validateWorkspaceYaml(): Promise<YamlValidationResult> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return {
      isValid: false,
      exists: false,
      errors: ['No workspace folder found'],
      warnings: [],
    };
  }

  const configPath = await findYamlConfigPath(workspaceFolder);
  if (!configPath) {
    return {
      isValid: false,
      exists: false,
      errors: [],
      warnings: [],
      configPath: undefined,
    };
  }

  return validateYamlConfig(configPath);
}

/**
 * Checks if a valid YAML config exists (quick check without full validation)
 */
export async function hasValidYamlConfig(): Promise<boolean> {
  const result = await validateWorkspaceYaml();
  return result.isValid;
}
