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

// Mock modules
vi.mock('fs');
vi.mock('vscode');
vi.mock('js-yaml');
vi.mock('../../gitUtils', () => ({
  getRepositoryRoot: vi.fn(),
}));

describe('yamlValidator', () => {
  let mockWorkspaceFolder: vscode.WorkspaceFolder;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkspaceFolder = {
      uri: { fsPath: '/workspace/project' },
      name: 'project',
      index: 0,
    };

    (vscode.workspace.workspaceFolders as any) = [mockWorkspaceFolder];
  });

  describe('findYamlConfigPath', () => {
    it('should find devgrid.yml in workspace root', async () => {
      const configPath = '/workspace/project/devgrid.yml';
      (fs.access as any) = vi.fn((file: string) => {
        if (file === configPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await findYamlConfigPath(mockWorkspaceFolder);

      expect(result).toBe(configPath);
    });

    it('should find devgrid.yaml if yml not found', async () => {
      const yamlPath = '/workspace/project/devgrid.yaml';
      (fs.access as any) = vi.fn((file: string) => {
        if (file === yamlPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await findYamlConfigPath(mockWorkspaceFolder);

      expect(result).toBe(yamlPath);
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
      const configPath = '/workspace/project/devgrid.yml';
      (fs.access as any) = vi.fn(() => Promise.reject(new Error('File not found')));

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.errors).toContain(`Config file not found: ${configPath}`);
    });

    it('should validate a correct YAML file', async () => {
      const configPath = '/workspace/project/devgrid.yml';
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
      const configPath = '/workspace/project/devgrid.yml';
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
      const configPath = '/workspace/project/devgrid.yml';
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
      const configPath = '/workspace/project/devgrid.yml';
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
      expect(result.warnings.some((w) => w.includes('appId'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('shortId'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('manifest'))).toBe(true);
    });

    it('should handle YAML parsing errors', async () => {
      const configPath = '/workspace/project/devgrid.yml';
      const configContent = 'invalid: yaml: content: [unclosed';

      (fs.access as any) = vi.fn(() => Promise.resolve());
      (fs.readFile as any) = vi.fn(() => Promise.resolve(configContent));
      (yaml.load as any) = vi.fn(() => {
        throw new Error('YAML parse error');
      });

      const result = await validateYamlConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Failed to parse YAML'))).toBe(true);
    });
  });

  describe('validateWorkspaceYaml', () => {
    it('should validate YAML in current workspace', async () => {
      const configPath = '/workspace/project/devgrid.yml';
      const configContent = `project:
  appId: 12345
  components:
    - name: my-component
      shortId: abc123
      manifest: package.json`;

      (fs.access as any) = vi.fn((file: string) => {
        if (file === configPath) {
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

      const { getRepositoryRoot } = await import('../../gitUtils');
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

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
      const configPath = '/workspace/project/devgrid.yml';
      (fs.access as any) = vi.fn((file: string) => {
        if (file === configPath) {
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

      const { getRepositoryRoot } = await import('../../gitUtils');
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      const result = await hasValidYamlConfig();

      expect(result).toBe(true);
    });

    it('should return false when no YAML file exists', async () => {
      (fs.access as any) = vi.fn(() => Promise.reject(new Error('File not found')));

      const { getRepositoryRoot } = await import('../../gitUtils');
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      const result = await hasValidYamlConfig();

      expect(result).toBe(false);
    });
  });
});

