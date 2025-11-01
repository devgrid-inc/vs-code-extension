import { ApiError } from '../errors/DevGridError';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { ILogger } from '../interfaces/ILogger';
import type { DevGridIncident } from '../types';

/**
 * GraphQL response interfaces
 */
interface GraphIncident {
  id?: string | null;
  title?: string | null;
  state?: string | null;
  createdAt?: string | null;
  closedAt?: string | null;
  description?: string | null;
}

interface EntityIncidentsResponse {
  incidents?: {
    items?: Array<GraphIncident | null> | null;
  } | null;
}

/**
 * Incident service for DevGrid incidents
 */
export class IncidentService {
  private cache = new Map<string, { data: DevGridIncident[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(
    private graphqlClient: IGraphQLClient,
    private logger: ILogger,
    private maxItems: number
  ) {}

  /**
   * Clears the cache for all or specific entity
   */
  clearCache(entityId?: string): void {
    if (entityId) {
      this.cache.delete(entityId);
      this.logger.debug('Cleared incidents cache for entity', { entityId });
    } else {
      this.cache.clear();
      this.logger.debug('Cleared all incidents cache');
    }
  }

  /**
   * Fetches incidents for an entity
   */
  async fetchIncidents(entityId: string): Promise<DevGridIncident[]> {
    this.logger.debug('Fetching incidents', { entityId });

    // Check cache first
    const cached = this.cache.get(entityId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug('Returning cached incidents', { entityId, count: cached.data.length });
      return cached.data;
    }

    try {
      const data = await this.graphqlClient.query<EntityIncidentsResponse>(
        `
          query EntityIncidents($entityId: ID!, $limit: Int!) {
            incidents(filter: { affectedApplicationIds: [$entityId] }, pagination: { limit: $limit }) {
              items {
                id
                title
                state
                createdAt
                closedAt
                description
              }
            }
          }
        `,
        {
          entityId,
          limit: this.maxItems,
        }
      );

      const incidents = data.data?.incidents?.items ?? [];
      const result: DevGridIncident[] = [];

      for (const item of incidents) {
        if (!item?.id || !item.title || !item.state) {
          continue;
        }

        result.push({
          id: item.id,
          title: item.title,
          state: item.state,
          openedAt: item.createdAt ?? undefined, // Use createdAt instead of openedAt
          closedAt: item.closedAt ?? undefined,
          summary: item.description ?? undefined, // Use description instead of summary
          url: undefined, // Not available on Incident type
        });
      }

      this.logger.debug('Fetched incidents', {
        entityId,
        count: result.length,
      });

      // Cache the result
      this.cache.set(entityId, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to fetch incidents', error as Error, { entityId });
      throw new ApiError('Failed to fetch incidents', {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
