import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

import type { IGraphQLClient } from '../../interfaces/IGraphQLClient';
import type { ILogger } from '../../interfaces/ILogger';
import { YamlTemplateService } from '../../services/YamlTemplateService';

// Mock modules
vi.mock('vscode');
vi.mock('fs');
vi.mock('../../gitUtils', () => ({
  getRemoteUrl: vi.fn(),
  getRepositoryRoot: vi.fn(),
}));

describe('YamlTemplateService', () => {
  let mockGraphQLClient: IGraphQLClient;
  let mockLogger: ILogger;
  let service: YamlTemplateService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGraphQLClient = {
      query: vi.fn(),
      mutate: vi.fn(),
      setEndpoint: vi.fn(),
      setAuthToken: vi.fn(),
    } as any;

    mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn(),
      getLevel: vi.fn(),
      child: vi.fn(),
    } as any;

    service = new YamlTemplateService(mockGraphQLClient, mockLogger);

    // Mock workspace
    const mockWorkspaceFolder = {
      uri: { fsPath: '/workspace/project' },
      name: 'project',
      index: 0,
    };
    (vscode.workspace.workspaceFolders as any) = [mockWorkspaceFolder];

    // Mock fs.existsSync
    (fs.existsSync as any) = vi.fn(() => false);
  });

  describe('generateTemplate', () => {
    it('should generate empty template when no workspace', async () => {
      (vscode.workspace.workspaceFolders as any) = undefined;

      const template = await service.generateTemplate();

      expect(template).toContain('# DevGrid Configuration');
      expect(template).toContain('appId: "******"');
      expect(template).toContain('components:');
      expect(template).toContain('Replace the ****** placeholders');
    });

    it('should generate template with detected repository info', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve('https://github.com/user/repo.git'));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      // Mock GraphQL response for repository
      (mockGraphQLClient.query as any).mockResolvedValueOnce({
        data: {
          allRepos: [
            {
              id: 'repo-123',
              name: 'my-repo',
              url: 'https://github.com/user/repo',
              components: [
                {
                  id: 'comp-456',
                  shortId: 'abc123',
                  name: 'frontend',
                },
              ],
            },
          ],
        },
      });

      // Mock GraphQL response for component entity
      (mockGraphQLClient.query as any).mockResolvedValueOnce({
        data: {
          entity: {
            id: 'comp-456',
            shortId: 'abc123',
            name: 'frontend',
            relationships: [
              {
                to: {
                  id: 'app-789',
                  shortId: 'my-app',
                  type: 'application',
                },
              },
            ],
          },
        },
      });

      // Mock GraphQL response for application
      (mockGraphQLClient.query as any).mockResolvedValueOnce({
        data: {
          application: {
            id: 'app-789',
            slug: 'my-app',
            appId: 98765,
          },
        },
      });

      // Mock manifest file detection
      (fs.existsSync as any) = vi.fn((filePath: string) => {
        return filePath.includes('package.json');
      });

      const template = await service.generateTemplate();

      expect(template).toContain('# DevGrid Configuration (auto-detected');
      expect(template).toContain('appId: 98765');
      expect(template).toContain('name: frontend');
      expect(template).toContain('shortId: abc123'); // Real detected value, not placeholder
      expect(template).toContain('manifest: package.json');
    });

    it('should generate template without API when repository not found', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve('https://github.com/user/repo.git'));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      // Mock GraphQL response - no repository found
      (mockGraphQLClient.query as any).mockResolvedValue({
        data: {
          allRepos: [],
        },
      });

      const template = await service.generateTemplate();

      expect(template).toContain('# DevGrid Configuration');
      expect(template).toContain('appId: "******"');
      expect(template).toContain('Replace the ****** placeholders');
    });

    it('should handle API errors gracefully', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve('https://github.com/user/repo.git'));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      // Mock GraphQL error
      (mockGraphQLClient.query as any).mockRejectedValue(new Error('API Error'));

      const template = await service.generateTemplate();

      expect(template).toContain('# DevGrid Configuration');
      expect(template).toContain('appId: "******"');
      expect(template).toContain('Replace the ****** placeholders');
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle missing git remote URL', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve(undefined));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      const template = await service.generateTemplate();

      expect(template).toContain('# DevGrid Configuration');
      expect(mockLogger.debug).toHaveBeenCalledWith('No git remote URL found');
    });

    it('should detect manifest file when present', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve(undefined));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      // Mock package.json exists
      (fs.existsSync as any) = vi.fn((filePath: string) => {
        return filePath.includes('package.json');
      });

      const template = await service.generateTemplate();

      expect(template).toContain('manifest: package.json');
    });

    it('should handle multiple components from repository', async () => {
      const { getRemoteUrl, getRepositoryRoot } = await import('../../gitUtils');
      (getRemoteUrl as any) = vi.fn(() => Promise.resolve('https://github.com/user/repo.git'));
      (getRepositoryRoot as any) = vi.fn(() => Promise.resolve('/workspace/project'));

      // Mock repository with multiple components
      (mockGraphQLClient.query as any).mockResolvedValueOnce({
        data: {
          allRepos: [
            {
              id: 'repo-123',
              name: 'my-repo',
              components: [
                {
                  id: 'comp-1',
                  shortId: 'frontend',
                  name: 'Frontend App',
                },
                {
                  id: 'comp-2',
                  shortId: 'backend',
                  name: 'Backend API',
                },
              ],
            },
          ],
        },
      });

      // Mock component entities
      (mockGraphQLClient.query as any)
        .mockResolvedValueOnce({
          data: {
            entity: {
              id: 'comp-1',
              relationships: [
                {
                  to: {
                    id: 'app-1',
                    type: 'application',
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            entity: {
              id: 'comp-2',
              relationships: [
                {
                  to: {
                    id: 'app-1',
                    type: 'application',
                  },
                },
              ],
            },
          },
        });

      // Mock application (same for both)
      (mockGraphQLClient.query as any).mockResolvedValue({
        data: {
          application: {
            id: 'app-1',
            appId: 12345,
          },
        },
      });

      (fs.existsSync as any) = vi.fn(() => false);

      const template = await service.generateTemplate();

      expect(template).toContain('Frontend App');
      expect(template).toContain('Backend API');
      expect((template.match(/components:/g) || []).length).toBeGreaterThan(0);
    });
  });
});

