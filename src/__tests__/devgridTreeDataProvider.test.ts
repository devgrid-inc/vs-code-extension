import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';

import type { AuthService } from '../authService';
import * as devgridConfig from '../devgridConfig';
import { DevGridTreeDataProvider, DevGridTreeItem } from '../devgridTreeDataProvider';
import type { ServiceContainer } from '../services/ServiceContainer';
import type { DevGridInsightBundle } from '../types';

// Mock devgridConfig module
vi.mock('../devgridConfig', () => ({
  loadDevGridContext: vi.fn(),
}));

// Mock yamlValidator module
vi.mock('../utils/yamlValidator', () => ({
  hasValidYamlConfig: vi.fn(),
}));

describe('DevGridTreeDataProvider', () => {
  let provider: DevGridTreeDataProvider;
  let mockServiceContainer: ServiceContainer;
  let mockAuthService: AuthService;
  let mockLogger: any;
  let mockClient: any;
  let mockLoadDevGridContext: any;

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

    // Create mock client
    mockClient = {
      fetchInsights: vi.fn(),
    };

    // Create mock service container
    mockServiceContainer = {
      get: vi.fn((key: string) => {
        if (key === 'logger') {
          return mockLogger;
        }
        return undefined;
      }),
      setApiBaseUrl: vi.fn(),
      setAuthToken: vi.fn(),
      createDevGridClient: vi.fn().mockReturnValue(mockClient),
    } as unknown as ServiceContainer;

    // Create mock auth service
    mockAuthService = {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
    } as unknown as AuthService;

    // Mock loadDevGridContext
    mockLoadDevGridContext = vi.mocked(devgridConfig).loadDevGridContext;

    // Mock vscode.workspace.getConfiguration
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'apiBaseUrl') {
          return 'https://prod.api.devgrid.io';
        }
        if (key === 'maxItemsPerSection') {
          return 5;
        }
        return defaultValue;
      }),
    } as any);

    provider = new DevGridTreeDataProvider(mockServiceContainer, mockAuthService);
  });

  describe('Tree Item Creation', () => {
    describe('DevGridTreeItem static methods', () => {
      it('should create section tree item with correct properties', () => {
        const item = DevGridTreeItem.section('Test Section', 'section:test', 'icon-test');
        
        expect(item.label).toBe('Test Section');
        expect(item.contextValue).toBe('section:test');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
      });

      it('should create detail tree item with correct properties', () => {
        const item = DevGridTreeItem.detail('Test Detail', 'icon-detail');
        
        expect(item.label).toBe('Test Detail');
        expect(item.contextValue).toBe('detail');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      });

      it('should create link tree item with correct command', () => {
        const item = DevGridTreeItem.link('Test Link', 'https://example.com', 'icon-link');
        
        expect(item.label).toBe('Test Link');
        expect(item.contextValue).toBe('link');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        expect(item.command).toBeDefined();
        expect(item.command?.command).toBe('vscode.open');
        expect(item.tooltip).toBe('https://example.com');
      });

      it('should create empty tree item with info icon', () => {
        const item = DevGridTreeItem.empty('No data');
        
        expect(item.label).toBe('No data');
        expect(item.contextValue).toBe('empty');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      });

      it('should create info tree item with custom icon', () => {
        const item = DevGridTreeItem.info('Loading...', 'sync~spin');
        
        expect(item.label).toBe('Loading...');
        expect(item.contextValue).toBe('info');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      });
    });

    describe('Vulnerability tree items', () => {
      it('should create vulnerability tree item with correct command and arguments', async () => {
        const mockContext = {
          identifiers: {
            repositorySlug: 'test/repo',
            repositoryId: 'repo-123',
          },
          config: {},
        };

        const mockInsights: DevGridInsightBundle = {
          repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
          component: undefined,
          application: undefined,
          vulnerabilities: [
            {
              id: 'vuln-123',
              title: 'Test Vulnerability',
              severity: 'high',
              status: 'open',
              packageName: 'test-package',
              versionRange: '>=1.0.0 <2.0.0',
              publishedAt: '2023-01-01T00:00:00Z',
            },
          ],
          incidents: [],
          dependencies: [],
        };

        mockLoadDevGridContext.mockResolvedValue(mockContext);
        mockClient.fetchInsights.mockResolvedValue(mockInsights);

        await provider.refresh();

        const rootItems = await provider.getChildren();
        expect(rootItems).toBeDefined();
        
        // Find vulnerabilities section
        const vulnSection = rootItems.find((item: DevGridTreeItem) => 
          item.contextValue === 'section:vulnerabilities'
        );
        expect(vulnSection).toBeDefined();

        // Get vulnerability children (grouped by severity)
        const vulnGroups = await provider.getChildren(vulnSection);
        expect(vulnGroups).toBeDefined();
        expect(vulnGroups.length).toBeGreaterThan(0);

        // Find high severity group
        const highGroup = vulnGroups.find((item: DevGridTreeItem) => 
          item.contextValue === 'vulnerability-group:high'
        );
        expect(highGroup).toBeDefined();

        // Get actual vulnerability items
        const vulnItems = await provider.getChildren(highGroup);
        expect(vulnItems).toBeDefined();
        expect(vulnItems.length).toBe(1);

        const vulnItem = vulnItems[0];
        expect(vulnItem.id).toBe('vuln-123');
        expect(vulnItem.label).toBe('Test Vulnerability');
        expect(vulnItem.contextValue).toBe('vulnerability');
        expect(vulnItem.command).toBeDefined();
        expect(vulnItem.command?.command).toBe('devgrid.openVulnerability');
        expect(vulnItem.command?.arguments).toEqual(['vuln-123']);
      });

      it('should handle vulnerability with undefined ID gracefully', async () => {
        const mockContext = {
          identifiers: { repositorySlug: 'test/repo' },
          config: {},
        };

        const mockInsights: DevGridInsightBundle = {
          repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
          component: undefined,
          application: undefined,
          vulnerabilities: [
            {
              id: undefined as any,
              title: 'Vulnerability without ID',
              severity: 'medium',
              status: 'open',
            },
          ],
          incidents: [],
          dependencies: [],
        };

        mockLoadDevGridContext.mockResolvedValue(mockContext);
        mockClient.fetchInsights.mockResolvedValue(mockInsights);

        await provider.refresh();

        const rootItems = await provider.getChildren();
        const vulnSection = rootItems.find((item: DevGridTreeItem) => 
          item.contextValue === 'section:vulnerabilities'
        );
        const vulnGroups = await provider.getChildren(vulnSection);
        const mediumGroup = vulnGroups.find((item: DevGridTreeItem) => 
          item.contextValue === 'vulnerability-group:medium'
        );
        const vulnItems = await provider.getChildren(mediumGroup);

        expect(vulnItems.length).toBe(1);
        const vulnItem = vulnItems[0];
        expect(vulnItem.id).toBeUndefined();
        expect(vulnItem.label).toBe('Vulnerability without ID');
      });

      it('should handle empty vulnerability ID string', async () => {
        const mockContext = {
          identifiers: { repositorySlug: 'test/repo' },
          config: {},
        };

        const mockInsights: DevGridInsightBundle = {
          repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
          component: undefined,
          application: undefined,
          vulnerabilities: [
            {
              id: '',
              title: 'Vulnerability with empty ID',
              severity: 'low',
              status: 'open',
            },
          ],
          incidents: [],
          dependencies: [],
        };

        mockLoadDevGridContext.mockResolvedValue(mockContext);
        mockClient.fetchInsights.mockResolvedValue(mockInsights);

        await provider.refresh();

        const rootItems = await provider.getChildren();
        const vulnSection = rootItems.find((item: DevGridTreeItem) => 
          item.contextValue === 'section:vulnerabilities'
        );
        const vulnGroups = await provider.getChildren(vulnSection);
        const lowGroup = vulnGroups.find((item: DevGridTreeItem) => 
          item.contextValue === 'vulnerability-group:low'
        );
        const vulnItems = await provider.getChildren(lowGroup);

        expect(vulnItems.length).toBe(1);
        const vulnItem = vulnItems[0];
        expect(vulnItem.id).toBe('');
        expect(vulnItem.label).toBe('Vulnerability with empty ID');
      });
    });
  });

  describe('Tree Hierarchy', () => {
    it('should return root items when no element is provided', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();

      expect(rootItems).toBeDefined();
      expect(rootItems.length).toBe(6);
      expect(rootItems[0].contextValue).toBe('section:repository');
      expect(rootItems[1].contextValue).toBe('section:component');
      expect(rootItems[2].contextValue).toBe('section:application');
      expect(rootItems[3].contextValue).toBe('section:vulnerabilities');
      expect(rootItems[4].contextValue).toBe('section:incidents');
      expect(rootItems[5].contextValue).toBe('section:dependencies');
    });

    it('should return loading state before refresh completes', async () => {
      const rootItems = await provider.getChildren();

      expect(rootItems).toBeDefined();
      expect(rootItems.length).toBe(1);
      expect(rootItems[0].contextValue).toBe('info');
      expect(rootItems[0].label).toContain('DevGrid insights');
    });

    it('should return error state when refresh fails', async () => {
      mockLoadDevGridContext.mockRejectedValue(new Error('Failed to load context'));

      await provider.refresh();

      const rootItems = await provider.getChildren();

      expect(rootItems).toBeDefined();
      expect(rootItems.length).toBe(1);
      expect(rootItems[0].contextValue).toBe('info');
      expect(rootItems[0].label).toContain('Failed to load context');
    });

    it('should return repository items when repository section is expanded', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: {
          id: 'repo-123',
          name: 'Test Repository',
          slug: 'test/repo',
          description: 'A test repository',
          url: 'https://example.com/repo',
        },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();
      const repoSection = rootItems.find((item: DevGridTreeItem) => 
        item.contextValue === 'section:repository'
      );

      const repoItems = await provider.getChildren(repoSection);

      expect(repoItems).toBeDefined();
      expect(repoItems.length).toBeGreaterThan(0);
      expect(repoItems[0].label).toContain('Test Repository');
    });

    it('should return vulnerability children grouped by severity', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [
          { id: 'vuln-1', title: 'Critical Vuln', severity: 'critical', status: 'open' },
          { id: 'vuln-2', title: 'High Vuln', severity: 'high', status: 'open' },
          { id: 'vuln-3', title: 'Medium Vuln', severity: 'medium', status: 'open' },
        ],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();
      const vulnSection = rootItems.find((item: DevGridTreeItem) => 
        item.contextValue === 'section:vulnerabilities'
      );

      const vulnGroups = await provider.getChildren(vulnSection);

      expect(vulnGroups).toBeDefined();
      expect(vulnGroups.length).toBe(3);
      
      const criticalGroup = vulnGroups.find((item: DevGridTreeItem) => 
        item.contextValue === 'vulnerability-group:critical'
      );
      expect(criticalGroup).toBeDefined();
      expect(criticalGroup?.label).toBe('CRITICAL (1)');

      const highGroup = vulnGroups.find((item: DevGridTreeItem) => 
        item.contextValue === 'vulnerability-group:high'
      );
      expect(highGroup).toBeDefined();
      expect(highGroup?.label).toBe('HIGH (1)');

      const mediumGroup = vulnGroups.find((item: DevGridTreeItem) => 
        item.contextValue === 'vulnerability-group:medium'
      );
      expect(mediumGroup).toBeDefined();
      expect(mediumGroup?.label).toBe('MEDIUM (1)');
    });

    it('should return incident children when incidents section is expanded', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [
          {
            id: 'incident-1',
            title: 'Test Incident',
            status: 'open',
            severity: 'high',
          },
        ],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();
      const incidentSection = rootItems.find((item: DevGridTreeItem) => 
        item.contextValue === 'section:incidents'
      );

      const incidentItems = await provider.getChildren(incidentSection);

      expect(incidentItems).toBeDefined();
      expect(incidentItems.length).toBe(1);
      expect(incidentItems[0].label).toBe('Test Incident');
      expect(incidentItems[0].contextValue).toBe('incident');
    });

    it('should return dependency children when dependencies section is expanded', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [
          {
            name: 'test-package',
            version: '1.0.0',
            type: 'npm',
          },
        ],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();
      const depSection = rootItems.find((item: DevGridTreeItem) => 
        item.contextValue === 'section:dependencies'
      );

      const depItems = await provider.getChildren(depSection);

      expect(depItems).toBeDefined();
      expect(depItems.length).toBe(1);
      expect(depItems[0].label).toContain('test-package');
      expect(depItems[0].contextValue).toBe('dependency');
    });

    it('should show empty message when no vulnerabilities exist', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      const rootItems = await provider.getChildren();
      const vulnSection = rootItems.find((item: DevGridTreeItem) => 
        item.contextValue === 'section:vulnerabilities'
      );

      const vulnItems = await provider.getChildren(vulnSection);

      expect(vulnItems).toBeDefined();
      expect(vulnItems.length).toBe(1);
      expect(vulnItems[0].contextValue).toBe('empty');
      expect(vulnItems[0].label).toContain('No active vulnerabilities');
    });
  });

  describe('Authentication', () => {
    it('should show sign-in message when no access token is available', async () => {
      (mockAuthService.getAccessToken as any).mockResolvedValue(null);

      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);

      await provider.refresh();

      const rootItems = await provider.getChildren();

      expect(rootItems).toBeDefined();
      expect(rootItems.length).toBe(1);
      expect(rootItems[0].label).toContain('Sign in');
    });
  });

  describe('Status Text', () => {
    it('should return loading status during refresh', () => {
      expect(provider.getStatusText()).toContain('Ready');
    });

    it('should return repository name after successful refresh', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'My Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      await provider.refresh();

      expect(provider.getStatusText()).toContain('My Test Repo');
    });

    it('should return error message when refresh fails', async () => {
      mockLoadDevGridContext.mockRejectedValue(new Error('Connection failed'));

      await provider.refresh();

      expect(provider.getStatusText()).toContain('Connection failed');
    });
  });

  describe('Refresh behavior', () => {
    it('should fire onDidChangeTreeData event on refresh', async () => {
      const mockContext = {
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      };

      const mockInsights: DevGridInsightBundle = {
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        component: undefined,
        application: undefined,
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      mockLoadDevGridContext.mockResolvedValue(mockContext);
      mockClient.fetchInsights.mockResolvedValue(mockInsights);

      const fireListener = vi.fn();
      provider.onDidChangeTreeData(fireListener);

      await provider.refresh();

      // Should fire at start and end of refresh
      expect(fireListener).toHaveBeenCalled();
    });
  });

  describe('YAML Validation on Refresh', () => {
    beforeEach(() => {
      // Set up default mocks for successful refresh
      mockLoadDevGridContext.mockResolvedValue({
        identifiers: { repositorySlug: 'test/repo' },
        config: {},
      });
      mockClient.fetchInsights.mockResolvedValue({
        repository: { id: 'repo-123', name: 'Test Repo', slug: 'test/repo' },
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      });
    });

    it('should show warning and stop refresh when YAML is missing', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockResolvedValue(false);

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve(undefined));
      (vscode.commands.executeCommand as any) = vi.fn();

      await provider.refresh();

      expect(hasValidYamlConfig).toHaveBeenCalled();
      expect(mockClient.fetchInsights).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'DevGrid: No valid devgrid.yml file found. Set up your configuration to see insights.',
        'Create Template',
        'Setup Guide',
        'Learn More'
      );
      expect(provider.getStatusText()).toContain('No valid devgrid.yml found');
    });

    it('should continue refresh when YAML is valid', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockResolvedValue(true);

      await provider.refresh();

      expect(hasValidYamlConfig).toHaveBeenCalled();
      expect(mockClient.fetchInsights).toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should not check YAML when not authenticated', async () => {
      (mockAuthService.getAccessToken as any) = vi.fn().mockResolvedValue(undefined);
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn();

      await provider.refresh();

      // Should not check YAML if not authenticated (fails earlier)
      expect(hasValidYamlConfig).not.toHaveBeenCalled();
      expect(provider.getStatusText()).toContain('Sign in');
    });

    it('should handle YAML check action: Create Template', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockResolvedValue(false);

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Create Template'));
      (vscode.commands.executeCommand as any) = vi.fn();

      await provider.refresh();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('devgrid.createYamlTemplate');
    });

    it('should handle YAML check action: Setup Guide', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockResolvedValue(false);

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Setup Guide'));
      (vscode.commands.executeCommand as any) = vi.fn();

      await provider.refresh();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('devgrid.openSetupGuide');
    });

    it('should handle YAML check action: Learn More', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockResolvedValue(false);

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Learn More'));
      (vscode.env.openExternal as any) = vi.fn();

      await provider.refresh();

      expect(vscode.env.openExternal).toHaveBeenCalledWith(
        vscode.Uri.parse('https://docs.devgrid.io/docs/devgrid-project-yaml')
      );
    });

    it('should handle YAML check errors gracefully', async () => {
      const { hasValidYamlConfig } = await import('../utils/yamlValidator');
      (hasValidYamlConfig as any) = vi.fn().mockRejectedValue(new Error('YAML check failed'));

      // Should not throw, just log error and continue
      await expect(provider.refresh()).resolves.not.toThrow();
      
      // Should still show warning since validation failed
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });
});
