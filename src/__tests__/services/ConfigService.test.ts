import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { ConfigurationError, ValidationError } from '../../errors/DevGridError';
import type { ILogger } from '../../interfaces/ILogger';
import { ConfigService } from '../../services/ConfigService';

// Mock fs module
vi.mock('fs');

// Mock js-yaml module
vi.mock('js-yaml');

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockLogger: ILogger;
  let mockFs: any;
  let mockYaml: any;

  beforeEach(() => {
    mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn(),
      getLevel: vi.fn().mockReturnValue('info'),
      child: vi.fn().mockReturnThis(),
    };

    mockFs = vi.mocked(fs);
    mockYaml = vi.mocked(yaml);

    configService = new ConfigService(mockLogger);
  });

  describe('loadConfig', () => {
    it('should load valid devgrid.yaml configuration', async () => {
      const mockConfig = {
        apiBaseUrl: 'https://api.devgrid.io',
        identifiers: {
          repositorySlug: 'user/repo',
          componentSlug: 'my-component',
        },
      };

      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('yaml content');
      mockYaml.load = vi.fn().mockReturnValue(mockConfig);

      const result = await configService.loadConfig();

      expect(result).toEqual(mockConfig);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration loaded successfully',
        expect.any(Object)
      );
    });

    it('should return undefined when no workspace folder exists', async () => {
      // Mock process.cwd() to return empty
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue('');

      const result = await configService.loadConfig();

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('No workspace folder found');

      process.cwd = originalCwd;
    });

    it('should return undefined when no config file is found', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      const result = await configService.loadConfig();

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('No devgrid.yaml file found in workspace');
    });

    it('should throw ConfigurationError when file read fails', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(configService.loadConfig()).rejects.toThrow(ConfigurationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw ConfigurationError when YAML parsing fails', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('invalid: yaml: content:');
      mockYaml.load = vi.fn().mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      await expect(configService.loadConfig()).rejects.toThrow(ConfigurationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw ValidationError when config is empty', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('');
      mockYaml.load = vi.fn().mockReturnValue(null);

      await expect(configService.loadConfig()).rejects.toThrow(ConfigurationError);
    });

    it('should find devgrid.yml file as fallback', async () => {
      const mockConfig = { apiBaseUrl: 'https://api.devgrid.io' };

      mockFs.existsSync = vi.fn()
        .mockReturnValueOnce(false) // devgrid.yaml doesn't exist
        .mockReturnValueOnce(true);  // devgrid.yml exists
      mockFs.readFileSync = vi.fn().mockReturnValue('yaml content');
      mockYaml.load = vi.fn().mockReturnValue(mockConfig);

      const result = await configService.loadConfig();

      expect(result).toEqual(mockConfig);
    });
  });

  describe('normalizeIdentifiers', () => {
    it('should normalize identifiers from identifiers section', () => {
      const config = {
        identifiers: {
          repositorySlug: 'user/repo',
          repositoryId: 'repo-123',
          componentSlug: 'my-component',
          componentId: 'comp-456',
          applicationSlug: 'my-app',
          applicationId: 'app-789',
        },
      };

      const result = configService.normalizeIdentifiers(config);

      expect(result).toEqual({
        repositorySlug: 'user/repo',
        repositoryId: 'repo-123',
        componentSlug: 'my-component',
        componentId: 'comp-456',
        applicationSlug: 'my-app',
        applicationId: 'app-789',
      });
    });

    it('should support legacy root-level identifiers', () => {
      const config = {
        repositorySlug: 'user/repo',
        componentSlug: 'my-component',
      } as any;

      const result = configService.normalizeIdentifiers(config);

      expect(result.repositorySlug).toBe('user/repo');
      expect(result.componentSlug).toBe('my-component');
    });

    it('should support nested repository/component/application objects', () => {
      const config = {
        repository: { slug: 'user/repo' },
        component: { slug: 'my-component', id: 'comp-123' },
        application: { slug: 'my-app', id: 'app-456' },
      } as any;

      const result = configService.normalizeIdentifiers(config);

      expect(result.repositorySlug).toBe('user/repo');
      expect(result.componentSlug).toBe('my-component');
      expect(result.componentId).toBe('comp-123');
      expect(result.applicationSlug).toBe('my-app');
      expect(result.applicationId).toBe('app-456');
    });

    it('should prioritize identifiers section over root-level', () => {
      const config = {
        identifiers: {
          repositorySlug: 'priority/repo',
        },
        repositorySlug: 'fallback/repo',
      } as any;

      const result = configService.normalizeIdentifiers(config);

      expect(result.repositorySlug).toBe('priority/repo');
    });

    it('should handle project.appId as string', () => {
      const mockOutputChannel = {
        appendLine: vi.fn(),
      };

      const config = {
        project: {
          appId: 'app-123',
        },
      };

      const result = configService.normalizeIdentifiers(config, mockOutputChannel);

      expect(result.applicationId).toBe('app-123');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should convert project.appId number to string', () => {
      const config = {
        project: {
          appId: 12345,
        },
      };

      const result = configService.normalizeIdentifiers(config);

      expect(result.applicationId).toBe('12345');
    });

    it('should select component from project.components array', () => {
      const mockOutputChannel = {
        appendLine: vi.fn(),
      };

      const config = {
        project: {
          components: [
            {
              shortId: 'comp-1',
              id: 'component-1',
              name: 'Component 1',
            },
          ],
        },
      };

      const result = configService.normalizeIdentifiers(config, mockOutputChannel);

      expect(result.componentSlug).toBe('comp-1');
      expect(result.componentId).toBe('component-1');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should select default component with manifest=package.json', () => {
      const config = {
        project: {
          components: [
            {
              shortId: 'comp-1',
              id: 'component-1',
              name: 'Component 1',
            },
            {
              shortId: 'comp-2',
              id: 'component-2',
              name: 'Component 2',
              manifest: 'package.json',
            },
          ],
        },
      };

      const result = configService.normalizeIdentifiers(config);

      expect(result.componentSlug).toBe('comp-2');
      expect(result.componentId).toBe('component-2');
    });

    it('should select default component with api=swagger.yml', () => {
      const config = {
        project: {
          components: [
            {
              shortId: 'comp-1',
              id: 'component-1',
              name: 'Component 1',
            },
            {
              shortId: 'comp-2',
              id: 'component-2',
              name: 'Component 2',
              api: 'swagger.yml',
            },
          ],
        },
      };

      const result = configService.normalizeIdentifiers(config);

      expect(result.componentSlug).toBe('comp-2');
      expect(result.componentId).toBe('component-2');
    });

    it('should fallback to first component if no default', () => {
      const config = {
        project: {
          components: [
            {
              shortId: 'comp-1',
              id: 'component-1',
              name: 'Component 1',
            },
            {
              shortId: 'comp-2',
              id: 'component-2',
              name: 'Component 2',
            },
          ],
        },
      };

      const result = configService.normalizeIdentifiers(config);

      expect(result.componentSlug).toBe('comp-1');
      expect(result.componentId).toBe('component-1');
    });

    it('should return empty identifiers for empty config', () => {
      const result = configService.normalizeIdentifiers({});

      expect(result).toEqual({});
    });
  });

  describe('loadDevGridContext', () => {
    it('should load complete DevGrid context', async () => {
      const mockConfig = {
        apiBaseUrl: 'https://api.devgrid.io',
        identifiers: {
          repositorySlug: 'user/repo',
        },
        endpoints: {
          dashboardUrl: 'https://dashboard.devgrid.io',
        },
      };

      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('yaml content');
      mockYaml.load = vi.fn().mockReturnValue(mockConfig);

      const result = await configService.loadDevGridContext();

      expect(result).toBeDefined();
      expect(result?.config).toEqual(mockConfig);
      expect(result?.identifiers).toBeDefined();
      expect(result?.apiBaseUrl).toBe('https://api.devgrid.io');
      expect(result?.endpoints).toBeDefined();
    });

    it('should return undefined when config is not found', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      const result = await configService.loadDevGridContext();

      expect(result).toBeUndefined();
    });

    it('should include dashboard URL in endpoints', async () => {
      const mockConfig = {
        dashboardUrl: 'https://dashboard.devgrid.io',
      };

      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('yaml content');
      mockYaml.load = vi.fn().mockReturnValue(mockConfig);

      const result = await configService.loadDevGridContext();

      expect(result?.endpoints?.dashboardUrl).toBe('https://dashboard.devgrid.io');
    });

    it('should merge endpoints from config.endpoints and config.dashboardUrl', async () => {
      const mockConfig = {
        endpoints: {
          customEndpoint: 'https://custom.devgrid.io',
        },
        dashboardUrl: 'https://dashboard.devgrid.io',
      };

      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('yaml content');
      mockYaml.load = vi.fn().mockReturnValue(mockConfig);

      const result = await configService.loadDevGridContext();

      expect(result?.endpoints?.customEndpoint).toBe('https://custom.devgrid.io');
      expect(result?.endpoints?.dashboardUrl).toBe('https://dashboard.devgrid.io');
    });
  });
});

