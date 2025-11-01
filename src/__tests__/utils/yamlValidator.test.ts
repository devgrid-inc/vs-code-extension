import { promises as fs } from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

import {
  findYamlConfigPath,
  validateYamlConfig,
  validateWorkspaceYaml,
  hasValidYamlConfig,
} from '../../utils/yamlValidator';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [] as any[],
  },
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  WorkspaceFolder: class {} as any,
}));
vi.mock('fs');
vi.mock('js-yaml');
vi.mock('../../gitUtils', () => ({
  getRepositoryRoot: vi.fn(),
}));

interface MockWorkspaceFolder {
  uri: { fsPath: string };
  name: string;
  index: number;
}

describe('yamlValidator', () => {
  let mockWorkspaceFolder: MockWorkspaceFolder;
  const getConfigPath = (fileName = 'devgrid.yml') =>
    path.join(mockWorkspaceFolder.uri.fsPath, fileName);

  beforeEach(() => {
    vi.clearAllMocks();

    const workspaceRoot = path.join('workspace', 'project');

    mockWorkspaceFolder = {
      uri: { fsPath: workspaceRoot },
      name: 'project',
      index: 0,
    };

    (vscode.workspace.workspaceFolders as any) = [mockWorkspaceFolder];
  });

  describe('findYamlConfigPath', () => {
    it('should find devgrid.yml in workspace root', async () => {
      const configPath = path.join(mockWorkspaceFolder.uri.fsPath, 'devgrid.yml');
      const normalizedConfigPath = path.normalize(configPath);
      (fs.access as any) = vi.fn((file: string) => {
        if (path.normalize(file) === normalizedConfigPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await findYamlConfigPath(mockWorkspaceFolder);

      expect(result).toBe(normalizedConfigPath);
    });

    it('should find devgrid.yaml if yml not found', async () => {
      const yamlPath = path.join(mockWorkspaceFolder.uri.fsPath, 'devgrid.yaml');
      const normalizedYamlPath = path.normalize(yamlPath);
      (fs.access as any) = vi.fn((file: string) => {
        if (path.normalize(file) === normalizedYamlPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await findYamlConfigPath(mockWorkspaceFolder);

      expect(result).toBe(normalizedYamlPath);
    });

    it('should return undefined when no config file found', async () => {
      (fs.access as any) = vi.fn(() => Promise.reject(new Error('File not found')));

      const result = await findYamlConfigPath(mockWorkspaceFolder);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no workspace folder provided', async () => {
      const result = await findYamlConfigPath(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('validateYamlConfig', () => {
    it('should return invalid when file does not exist', async () => {
      const configPath = getConfigPath();
      (fs.access as any) = vi.fn(() => Promise.reject(new Error('File not found')));

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errors).toContain(`Config file not found: ${configPath}`);
    });

    it('should validate a correct YAML file', async () => {
      const configPath = getConfigPath();
      const configContent = `project:
  appId: 12345
  components:
    - name: my-component
      shortId: abc123
      manifest: package.json`;

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => ({
        project: {
          appId: 12345,
          components: [
            {
              name: 'my-component',
              shortId: 'abc123',
              manifest: 'package.json',
            },
          ],
        },
      }));

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing project section', async () => {
      const configPath = getConfigPath();
      const configContent = 'apiBaseUrl: https://api.devgrid.io';

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => ({
        apiBaseUrl: 'https://api.devgrid.io',
      }));

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required "project" section');
    });

    it('should return errors for empty components array', async () => {
      const configPath = getConfigPath();
      const configContent = `project:
  appId: 12345
  components: []`;

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => ({
        project: {
          appId: 12345,
          components: [],
        },
      }));

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Project "components" array cannot be empty');
    });

    it('should return warnings for missing optional fields', async () => {
      const configPath = getConfigPath();
      const configContent = `project:
  components:
    - name: my-component`;

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => ({
        project: {
          components: [
            {
              name: 'my-component',
            },
          ],
        },
      }));

      const result = await validateYamlConfig(configPath);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('appId'))).toBe(true);
      expect(result.warnings.some(w => w.includes('shortId'))).toBe(true);
      expect(result.warnings.some(w => w.includes('manifest'))).toBe(true);
    });

    it('should handle YAML parsing errors', async () => {
      const configPath = getConfigPath();
      const configContent = 'invalid: yaml: content: [unclosed';

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => {
        throw new Error('YAML parse error');
      });

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Failed to parse YAML'))).toBe(true);
    });
  });

  describe('validateWorkspaceYaml', () => {
    it('should validate YAML in current workspace', async () => {
      const configPath = getConfigPath();
      const normalizedConfigPath = path.normalize(configPath);
      const configContent = `project:
  appId: 12345
  components:
    - name: my-component
      shortId: abc123
      manifest: package.json`;

      (fs.access as any) = vi.fn((file: string) => {
        if (path.normalize(file) === normalizedConfigPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => ({
        project: {
          appId: 12345,
          components: [
            {
              name: 'my-component',
              shortId: 'abc123',
              manifest: 'package.json',
            },
          ],
        },
      }));

      const result = await validateWorkspaceYaml();

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('should return invalid when no workspace folder', async () => {
      (vscode.workspace.workspaceFolders as any) = undefined;

      const result = await validateWorkspaceYaml();

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errors).toContain('No workspace folder found');
    });
  });

  describe('hasValidYamlConfig', () => {
    it('should return true for valid YAML', async () => {
      const configPath = getConfigPath();
      const normalizedConfigPath = path.normalize(configPath);
      (fs.access as any) = vi.fn((file: string) => {
        if (path.normalize(file) === normalizedConfigPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });
      (fs.readFile as any) = vi.fn(() => Promise.resolve('valid yaml'));
      (yaml.load as any) = vi.fn(() => ({
        project: {
          appId: 12345,
          components: [{ name: 'component', shortId: 'abc', manifest: 'package.json' }],
        },
      }));

      const result = await hasValidYamlConfig();

      expect(result).toBe(true);
    });

    it('should return false when no YAML file exists', async () => {
      (fs.access as any) = vi.fn(() => Promise.reject(new Error('File not found')));

      const result = await hasValidYamlConfig();

      expect(result).toBe(false);
    });
  });
});
