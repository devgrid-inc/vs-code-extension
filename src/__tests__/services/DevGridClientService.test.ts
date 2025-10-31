import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ILogger } from '../../interfaces/ILogger';
import type { DependencyService } from '../../services/DependencyService';
import { DevGridClientService } from '../../services/DevGridClientService';
import type { EntityResolver } from '../../services/EntityResolver';
import type { IncidentService } from '../../services/IncidentService';
import type { VulnerabilityService } from '../../services/VulnerabilityService';

describe('DevGridClientService', () => {
  let clientService: DevGridClientService;
  let mockEntityResolver: EntityResolver;
  let mockVulnerabilityService: VulnerabilityService;
  let mockIncidentService: IncidentService;
  let mockDependencyService: DependencyService;
  let mockLogger: ILogger;
  let mockEndpoints: Record<string, string | undefined>;

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

    mockEntityResolver = {
      loadComponentDetails: vi.fn(),
      loadRepositoryDetails: vi.fn(),
      loadApplicationDetails: vi.fn(),
      toEntitySummary: vi.fn(),
      toRepositorySummary: vi.fn(),
      toApplicationSummary: vi.fn(),
    } as unknown as EntityResolver;

    mockVulnerabilityService = {
      fetchVulnerabilities: vi.fn(),
    } as unknown as VulnerabilityService;

    mockIncidentService = {
      fetchIncidents: vi.fn(),
    } as unknown as IncidentService;

    mockDependencyService = {
      fetchDependencies: vi.fn(),
    } as unknown as DependencyService;

    mockEndpoints = {
      dashboardUrl: 'https://dashboard.devgrid.io/{repositorySlug}',
    };

    clientService = new DevGridClientService(
      mockEntityResolver,
      mockVulnerabilityService,
      mockIncidentService,
      mockDependencyService,
      mockLogger,
      mockEndpoints
    );
  });

  describe('fetchInsights', () => {
    it('should fetch comprehensive insights with all entity types', async () => {
      const identifiers = {
        repositorySlug: 'user/repo',
        repositoryId: 'repo-123',
        componentSlug: 'my-component',
        componentId: 'comp-456',
        applicationSlug: 'my-app',
        applicationId: 'app-789',
      };

      const mockComponentDetails = {
        entity: { id: 'comp-456', name: 'My Component' },
        attributes: new Map(),
        relationships: [],
      };

      const mockRepositoryDetails = {
        entity: { id: 'repo-123', name: 'My Repo' },
        attributes: new Map(),
        relationships: [],
      };

      const mockApplicationDetails = {
        entity: { id: 'app-789', name: 'My App' },
        attributes: new Map(),
        relationships: [],
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue(mockComponentDetails);
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(mockRepositoryDetails);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(mockApplicationDetails);

      (mockEntityResolver.toEntitySummary as any).mockReturnValue({
        id: 'comp-456',
        name: 'My Component',
        slug: 'my-component',
      });

      (mockEntityResolver.toRepositorySummary as any).mockReturnValue({
        id: 'repo-123',
        name: 'My Repo',
        slug: 'user/repo',
      });

      (mockEntityResolver.toApplicationSummary as any).mockReturnValue({
        id: 'app-789',
        name: 'My App',
        slug: 'my-app',
      });

      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([
        { id: 'vuln-1', title: 'Vulnerability 1', severity: 'high' },
      ]);

      (mockIncidentService.fetchIncidents as any).mockResolvedValue([
        { id: 'inc-1', title: 'Incident 1', state: 'open' },
      ]);

      (mockDependencyService.fetchDependencies as any).mockResolvedValue([
        { id: 'dep-1', name: 'lodash', version: '4.17.21' },
      ]);

      const result = await clientService.fetchInsights(identifiers);

      expect(result).toBeDefined();
      expect(result.component).toBeDefined();
      expect(result.repository).toBeDefined();
      expect(result.application).toBeDefined();
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.incidents).toHaveLength(1);
      expect(result.dependencies).toHaveLength(1);

      expect(mockLogger.info).toHaveBeenCalledWith('Starting insights fetch', { identifiers });
      expect(mockLogger.info).toHaveBeenCalledWith('Insights fetch completed', expect.any(Object));
    });

    it('should handle missing component details gracefully', async () => {
      const identifiers = {
        repositoryId: 'repo-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([]);

      const result = await clientService.fetchInsights(identifiers);

      expect(result).toBeDefined();
      expect(result.component).toBeUndefined();
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.incidents).toHaveLength(0);
      expect(result.dependencies).toHaveLength(0);
    });

    it('should fetch vulnerabilities when componentId or repositoryId is available', async () => {
      const identifiers = {
        componentId: 'comp-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue({
        entity: { id: 'comp-123' },
        attributes: new Map(),
        relationships: [],
      });
      (mockEntityResolver.toEntitySummary as any).mockReturnValue({ id: 'comp-123', name: 'Component' });
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([
        { id: 'vuln-1', title: 'Test Vuln' },
      ]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([]);
      (mockDependencyService.fetchDependencies as any).mockResolvedValue([]);

      const result = await clientService.fetchInsights(identifiers);

      expect(mockVulnerabilityService.fetchVulnerabilities).toHaveBeenCalledWith('comp-123', undefined);
      expect(result.vulnerabilities).toHaveLength(1);
    });

    it('should fetch incidents using componentId or repositoryId', async () => {
      const identifiers = {
        repositoryId: 'repo-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([
        { id: 'inc-1', title: 'Incident 1' },
      ]);

      const result = await clientService.fetchInsights(identifiers);

      expect(mockIncidentService.fetchIncidents).toHaveBeenCalledWith('repo-123');
      expect(result.incidents).toHaveLength(1);
    });

    it('should limit incidents to 20 items', async () => {
      const identifiers = {
        componentId: 'comp-123',
      };

      const manyIncidents = Array.from({ length: 50 }, (_, i) => ({
        id: `inc-${i}`,
        title: `Incident ${i}`,
      }));

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue({
        entity: { id: 'comp-123' },
        attributes: new Map(),
        relationships: [],
      });
      (mockEntityResolver.toEntitySummary as any).mockReturnValue({ id: 'comp-123' });
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue(manyIncidents);
      (mockDependencyService.fetchDependencies as any).mockResolvedValue([]);

      const result = await clientService.fetchInsights(identifiers);

      expect(result.incidents).toHaveLength(20);
    });

    it('should fetch dependencies only when componentId is available', async () => {
      const identifiers = {
        componentId: 'comp-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue({
        entity: { id: 'comp-123' },
        attributes: new Map(),
        relationships: [],
      });
      (mockEntityResolver.toEntitySummary as any).mockReturnValue({ id: 'comp-123' });
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([]);
      (mockDependencyService.fetchDependencies as any).mockResolvedValue([
        { id: 'dep-1', name: 'package' },
      ]);

      const result = await clientService.fetchInsights(identifiers);

      expect(mockDependencyService.fetchDependencies).toHaveBeenCalledWith('comp-123');
      expect(result.dependencies).toHaveLength(1);
    });

    it('should not fetch dependencies when only repositoryId is available', async () => {
      const identifiers = {
        repositoryId: 'repo-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([]);

      const result = await clientService.fetchInsights(identifiers);

      expect(mockDependencyService.fetchDependencies).not.toHaveBeenCalled();
      expect(result.dependencies).toHaveLength(0);
    });

    it('should update status text on error', async () => {
      const identifiers = {
        componentId: 'comp-123',
      };

      const error = new Error('Failed to fetch data');
      (mockEntityResolver.loadComponentDetails as any).mockRejectedValue(error);

      await expect(clientService.fetchInsights(identifiers)).rejects.toThrow('Failed to fetch data');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch insights',
        error,
        { identifiers }
      );

      const statusText = clientService.getStatusText();
      expect(statusText).toContain('Error');
      expect(statusText).toContain('Failed to fetch data');
    });

    it('should reset status text to Ready after successful fetch', async () => {
      const identifiers = {
        componentId: 'comp-123',
      };

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue({
        entity: { id: 'comp-123' },
        attributes: new Map(),
        relationships: [],
      });
      (mockEntityResolver.toEntitySummary as any).mockReturnValue({ id: 'comp-123' });
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockResolvedValue([]);
      (mockIncidentService.fetchIncidents as any).mockResolvedValue([]);
      (mockDependencyService.fetchDependencies as any).mockResolvedValue([]);

      await clientService.fetchInsights(identifiers);

      const statusText = clientService.getStatusText();
      expect(statusText).toBe('DevGrid: Ready');
    });
  });

  describe('getStatusText', () => {
    it('should return initial status text', () => {
      const statusText = clientService.getStatusText();
      expect(statusText).toBe('DevGrid: Ready');
    });
  });

  describe('dashboard URL management', () => {
    it('should get and set dashboard URL', () => {
      const url = 'https://dashboard.devgrid.io/repo/user/repo';
      clientService.setDashboardUrl(url);

      expect(clientService.getDashboardUrl()).toBe(url);
    });

    it('should return undefined when dashboard URL is not set', () => {
      expect(clientService.getDashboardUrl()).toBeUndefined();
    });

    it('should render dashboard URL from template', () => {
      const context = {
        repositorySlug: 'user/repo',
      };

      const url = clientService.renderDashboardUrl(context);

      expect(url).toBe('https://dashboard.devgrid.io/user/repo');
    });

    it('should return undefined when dashboard URL template is not configured', () => {
      const emptyEndpointsService = new DevGridClientService(
        mockEntityResolver,
        mockVulnerabilityService,
        mockIncidentService,
        mockDependencyService,
        mockLogger,
        {}
      );

      const result = emptyEndpointsService.renderDashboardUrl({ repositorySlug: 'user/repo' });

      expect(result).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should propagate errors from entity resolver', async () => {
      const identifiers = { componentId: 'comp-123' };
      const error = new Error('Entity resolver error');

      (mockEntityResolver.loadComponentDetails as any).mockRejectedValue(error);

      await expect(clientService.fetchInsights(identifiers)).rejects.toThrow('Entity resolver error');
    });

    it('should propagate errors from vulnerability service', async () => {
      const identifiers = { componentId: 'comp-123' };
      const error = new Error('Vulnerability service error');

      (mockEntityResolver.loadComponentDetails as any).mockResolvedValue({
        entity: { id: 'comp-123' },
        attributes: new Map(),
        relationships: [],
      });
      (mockEntityResolver.toEntitySummary as any).mockReturnValue({ id: 'comp-123' });
      (mockEntityResolver.loadRepositoryDetails as any).mockResolvedValue(undefined);
      (mockEntityResolver.loadApplicationDetails as any).mockResolvedValue(undefined);
      (mockVulnerabilityService.fetchVulnerabilities as any).mockRejectedValue(error);

      await expect(clientService.fetchInsights(identifiers)).rejects.toThrow('Vulnerability service error');
    });
  });
});

