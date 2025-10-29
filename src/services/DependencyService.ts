import type { ILogger } from '../interfaces/ILogger';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { DevGridDependency } from '../types';
import { ApiError } from '../errors/DevGridError';

/**
 * GraphQL response interfaces
 */
interface GraphDependency {
  id?: string | null;
  name?: string | null;
  version?: string | null;
  type?: string | null;
  latestVersion?: string | null;
  url?: string | null;
}

interface EntityDependenciesResponse {
  dependencies?: {
    items?: Array<GraphDependency | null> | null;
  } | null;
}

/**
 * Dependency service for DevGrid dependencies
 */
export class DependencyService {
  constructor(
    private graphqlClient: IGraphQLClient,
    private logger: ILogger,
    private maxItems: number
  ) {}

  /**
   * Fetches dependencies for an entity
   */
  async fetchDependencies(entityId: string): Promise<DevGridDependency[]> {
    this.logger.debug('Fetching dependencies', { entityId });

    try {
      const data = await this.graphqlClient.query<EntityDependenciesResponse>(
        `
          query EntityDependencies($entityId: ID!, $limit: Int!) {
            dependencies(filter: { entityId: $entityId }, pagination: { limit: $limit }) {
              items {
                id
                name
                version
                type
                latestVersion
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

      const dependencies = data.data?.dependencies?.items ?? [];
      const result: DevGridDependency[] = [];

      for (const item of dependencies) {
        if (!item?.id || !item.name) {
          continue;
        }

        result.push({
          id: item.id,
          name: item.name,
          version: item.version ?? undefined,
          type: item.type ?? undefined,
          latestVersion: item.latestVersion ?? undefined,
          url: item.url ?? undefined,
        });
      }

      this.logger.debug('Fetched dependencies', {
        entityId,
        count: result.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to fetch dependencies', error as Error, { entityId });
      throw new ApiError('Failed to fetch dependencies', {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
