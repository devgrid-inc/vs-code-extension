import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { ILogger } from '../interfaces/ILogger';
import type { DevGridDependency } from '../types';

/**
 * Dependency service for DevGrid dependencies
 */
export class DependencyService {
  private cache = new Map<string, { data: DevGridDependency[]; timestamp: number }>();
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
      this.logger.debug('Cleared dependencies cache for entity', { entityId });
    } else {
      this.cache.clear();
      this.logger.debug('Cleared all dependencies cache');
    }
  }

  /**
   * Fetches dependencies for an entity
   * Note: Dependencies query is not yet available in the GraphQL API
   */
  async fetchDependencies(entityId: string): Promise<DevGridDependency[]> {
    this.logger.debug('Fetching dependencies', { entityId });

    // Check cache first
    const cached = this.cache.get(entityId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug('Returning cached dependencies', { entityId, count: cached.data.length });
      return cached.data;
    }

    // Dependencies query is not available in the GraphQL schema yet
    // Return empty array until the API supports it
    this.logger.debug('Dependencies query not available in GraphQL API', { entityId });
    
    const result: DevGridDependency[] = [];
    
    // Cache the result
    this.cache.set(entityId, {
      data: result,
      timestamp: Date.now(),
    });
    
    return result;
  }
}
