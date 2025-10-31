import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiError } from '../../errors/DevGridError';
import type { IGraphQLClient } from '../../interfaces/IGraphQLClient';
import type { ILogger } from '../../interfaces/ILogger';
import { IncidentService } from '../../services/IncidentService';

describe('IncidentService', () => {
  let incidentService: IncidentService;
  let mockLogger: ILogger;
  let mockGraphQLClient: IGraphQLClient;

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

    mockGraphQLClient = {
      query: vi.fn(),
      mutate: vi.fn(),
      setEndpoint: vi.fn(),
      setAuthToken: vi.fn(),
    };

    incidentService = new IncidentService(mockGraphQLClient, mockLogger, 100);
  });

  describe('fetchIncidents', () => {
    it('should fetch incidents successfully with valid data', async () => {
      const mockResponse = {
        data: {
          incidents: {
            items: [
              {
                id: 'incident-1',
                title: 'Test Incident 1',
                state: 'open',
                openedAt: '2023-01-01T00:00:00Z',
                closedAt: null,
                summary: 'Test summary',
                url: 'https://example.com/incident-1',
              },
              {
                id: 'incident-2',
                title: 'Test Incident 2',
                state: 'resolved',
                openedAt: '2023-01-02T00:00:00Z',
                closedAt: '2023-01-03T00:00:00Z',
                summary: 'Another summary',
                url: 'https://example.com/incident-2',
              },
            ],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'incident-1',
        title: 'Test Incident 1',
        state: 'open',
        openedAt: undefined,
        closedAt: undefined,
        summary: undefined,
        url: undefined,
      });
      expect(result[1]).toEqual({
        id: 'incident-2',
        title: 'Test Incident 2',
        state: 'resolved',
        openedAt: undefined,
        closedAt: '2023-01-03T00:00:00Z',
        summary: undefined,
        url: undefined,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Fetching incidents', { entityId: 'entity-123' });
      expect(mockLogger.debug).toHaveBeenCalledWith('Fetched incidents', {
        entityId: 'entity-123',
        count: 2,
      });
    });

    it('should filter out incidents with missing required fields', async () => {
      const mockResponse = {
        data: {
          incidents: {
            items: [
              {
                id: 'incident-1',
                title: 'Valid Incident',
                state: 'open',
                openedAt: '2023-01-01T00:00:00Z',
              },
              {
                id: null,
                title: 'Missing ID',
                state: 'open',
              },
              {
                id: 'incident-3',
                title: null,
                state: 'open',
              },
              {
                id: 'incident-4',
                title: 'Missing State',
                state: null,
              },
            ],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('incident-1');
    });

    it('should handle empty incidents response', async () => {
      const mockResponse = {
        data: {
          incidents: {
            items: [],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith('Fetched incidents', {
        entityId: 'entity-123',
        count: 0,
      });
    });

    it('should handle null incidents in response', async () => {
      const mockResponse = {
        data: {
          incidents: null,
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(0);
    });

    it('should handle missing data in response', async () => {
      const mockResponse = {
        data: null,
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(0);
    });

    it('should throw ApiError when GraphQL query fails', async () => {
      const graphqlError = new Error('GraphQL query failed');
      (mockGraphQLClient.query as any).mockRejectedValue(graphqlError);

      await expect(incidentService.fetchIncidents('entity-123')).rejects.toThrow(ApiError);
      await expect(incidentService.fetchIncidents('entity-123')).rejects.toThrow('Failed to fetch incidents');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch incidents',
        graphqlError,
        { entityId: 'entity-123' }
      );
    });

    it('should pass correct query and variables to GraphQL client', async () => {
      const mockResponse = {
        data: {
          incidents: {
            items: [],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      await incidentService.fetchIncidents('entity-456');

      expect(mockGraphQLClient.query).toHaveBeenCalledWith(
        expect.stringContaining('query EntityIncidents'),
        {
          entityId: 'entity-456',
          limit: 100,
        }
      );
    });

    it('should respect maxItems parameter', async () => {
      const customIncidentService = new IncidentService(mockGraphQLClient, mockLogger, 5);

      const mockResponse = {
        data: {
          incidents: {
            items: [],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      await customIncidentService.fetchIncidents('entity-789');

      expect(mockGraphQLClient.query).toHaveBeenCalledWith(
        expect.any(String),
        {
          entityId: 'entity-789',
          limit: 5,
        }
      );
    });

    it('should handle null values in optional fields', async () => {
      const mockResponse = {
        data: {
          incidents: {
            items: [
              {
                id: 'incident-1',
                title: 'Minimal Incident',
                state: 'open',
                openedAt: null,
                closedAt: null,
                summary: null,
                url: null,
              },
            ],
          },
        },
      };

      (mockGraphQLClient.query as any).mockResolvedValue(mockResponse);

      const result = await incidentService.fetchIncidents('entity-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'incident-1',
        title: 'Minimal Incident',
        state: 'open',
        openedAt: undefined,
        closedAt: undefined,
        summary: undefined,
        url: undefined,
      });
    });

    it('should handle non-Error objects thrown by GraphQL client', async () => {
      (mockGraphQLClient.query as any).mockRejectedValue('String error');

      await expect(incidentService.fetchIncidents('entity-123')).rejects.toThrow(ApiError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch incidents',
        'String error',
        { entityId: 'entity-123' }
      );
    });
  });
});

