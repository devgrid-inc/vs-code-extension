import type { ILogger } from '../interfaces/ILogger';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { DevGridIncident } from '../types';
import { ApiError } from '../errors/DevGridError';

/**
 * GraphQL response interfaces
 */
interface GraphIncident {
  id?: string | null;
  title?: string | null;
  state?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  summary?: string | null;
  url?: string | null;
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
  constructor(
    private graphqlClient: IGraphQLClient,
    private logger: ILogger,
    private maxItems: number
  ) {}

  /**
   * Fetches incidents for an entity
   */
  async fetchIncidents(entityId: string): Promise<DevGridIncident[]> {
    this.logger.debug('Fetching incidents', { entityId });

    try {
      const data = await this.graphqlClient.query<EntityIncidentsResponse>(
        `
          query EntityIncidents($entityId: ID!, $limit: Int!) {
            incidents(filter: { entityId: $entityId }, pagination: { limit: $limit }) {
              items {
                id
                title
                state
                openedAt
                closedAt
                summary
                url
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
          openedAt: item.openedAt ?? undefined,
          closedAt: item.closedAt ?? undefined,
          summary: item.summary ?? undefined,
          url: item.url ?? undefined,
        });
      }

      this.logger.debug('Fetched incidents', {
        entityId,
        count: result.length,
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
