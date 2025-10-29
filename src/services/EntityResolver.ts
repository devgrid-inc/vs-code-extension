import type { ILogger } from '../interfaces/ILogger';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { IGitService } from '../interfaces/IGitService';
import type { DevGridIdentifiers, DevGridEntitySummary } from '../types';
import { convertToHttpsUrl, extractRepoNameFromUrl } from '../utils/urlUtils';
import { ApiError } from '../errors/DevGridError';

/**
 * GraphQL response interfaces
 */
interface GraphEntity {
  id?: string | null;
  shortId?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  attributes?: Array<{
    field?: string | null;
    value?: unknown;
  } | null> | null;
  relationships?: Array<{
    to?: {
      id?: string | null;
      shortId?: string | null;
      name?: string | null;
      type?: string | null;
    } | null;
  } | null> | null;
}

interface GraphEntityDetails {
  entity: {
    id?: string | null;
    shortId?: string | null;
    name?: string | null;
    description?: string | null;
    type?: string | null;
  };
  attributes: Map<string, unknown>;
  relationships: Array<{
    to?: {
      id?: string | null;
      shortId?: string | null;
      name?: string | null;
      type?: string | null;
    } | null;
  }>;
}

interface EntityByIdResponse {
  entity?: GraphEntity | null;
}

interface EntityByShortIdResponse {
  allEntities?: Array<GraphEntity | null> | null;
}

interface AllReposResponse {
  allRepos: Array<{
    id: string;
    name: string;
    description?: string;
    url?: string;
    ignore?: boolean;
    readyForIntegration?: boolean;
    externalSystem?: string;
  }>;
}

/**
 * Entity resolver service for DevGrid entities
 */
export class EntityResolver {
  constructor(
    private graphqlClient: IGraphQLClient,
    private gitService: IGitService,
    private logger: ILogger
  ) {}

  /**
   * Loads component details by ID or slug
   */
  async loadComponentDetails(
    context: DevGridIdentifiers
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    this.logger.debug('Loading component details', {
      componentId: context.componentId,
      componentSlug: context.componentSlug,
    });

    if (context.componentId) {
      details = await this.fetchEntityGraphQL({ id: context.componentId }, 'component');
    }

    if (!details && context.componentSlug) {
      details = await this.fetchEntityGraphQL({ shortId: context.componentSlug }, 'component');
    }

    if (!details) {
      this.logger.debug('No component found');
      return undefined;
    }

    this.logger.debug('Found component entity', {
      id: details.entity.id ?? '(none)',
      shortId: details.entity.shortId ?? '(none)',
    });

    context.componentId = details.entity.id ?? context.componentId;
    context.componentSlug = details.entity.shortId ?? context.componentSlug;

    return details;
  }

  /**
   * Loads repository details by ID, slug, or URL
   */
  async loadRepositoryDetails(
    context: DevGridIdentifiers,
    componentDetails?: GraphEntityDetails
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    this.logger.debug('Loading repository details', {
      repositoryId: context.repositoryId,
      repositorySlug: context.repositorySlug,
    });

    if (context.repositoryId) {
      if (context.repositoryId.includes('-')) {
        // UUID format
        details = await this.fetchEntityGraphQL({ id: context.repositoryId }, 'repo');
      } else {
        // Short ID format
        details = await this.fetchEntityGraphQL({ shortId: context.repositoryId }, 'repo');
      }
    }

    if (!details && context.repositorySlug) {
      // First try to find by shortId
      details = await this.fetchEntityGraphQL({ shortId: context.repositorySlug }, 'repo');

      // If not found by shortId, try to find by URL
      if (!details) {
        const gitRemoteUrl = await this.getGitRemoteUrl();
        if (gitRemoteUrl) {
          this.logger.debug('Searching repositories by URL', { url: gitRemoteUrl });
          details = await this.fetchRepositoryByUrl(gitRemoteUrl);
        }
      }
    }

    if (!details && componentDetails) {
      const relatedRepo = componentDetails.relationships.find((relationship) =>
        relationship.to?.type ? relationship.to.type.toLowerCase() === 'repo' : false
      );

      if (relatedRepo?.to) {
        context.repositoryId = relatedRepo.to.id ?? context.repositoryId;
        context.repositorySlug = relatedRepo.to.shortId ?? context.repositorySlug;

        if (relatedRepo.to.id) {
          details = await this.fetchEntityGraphQL({ id: relatedRepo.to.id }, 'repo');
        } else if (relatedRepo.to.shortId) {
          details = await this.fetchEntityGraphQL({ shortId: relatedRepo.to.shortId }, 'repo');
        }
      }
    }

    if (details) {
      this.logger.debug('Found repository entity', {
        id: details.entity.id ?? '(none)',
        shortId: details.entity.shortId ?? '(none)',
      });

      context.repositoryId = details.entity.id ?? context.repositoryId;
      context.repositorySlug = details.entity.shortId ?? context.repositorySlug;
    } else {
      this.logger.debug('No repository found');
    }

    return details;
  }

  /**
   * Loads application details by ID or slug
   */
  async loadApplicationDetails(
    context: DevGridIdentifiers,
    componentDetails?: GraphEntityDetails
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    this.logger.debug('Loading application details', {
      applicationId: context.applicationId,
      applicationSlug: context.applicationSlug,
    });

    if (context.applicationId) {
      if (context.applicationId.includes('-')) {
        // UUID format
        details = await this.fetchEntityGraphQL({ id: context.applicationId }, 'application');
      } else {
        // Short ID format
        details = await this.fetchEntityGraphQL({ shortId: context.applicationId }, 'application');
      }
    }

    if (!details && context.applicationSlug) {
      details = await this.fetchEntityGraphQL({ shortId: context.applicationSlug }, 'application');
    }

    if (!details && componentDetails) {
      const relatedApp = componentDetails.relationships.find((relationship) =>
        relationship.to?.type ? relationship.to.type.toLowerCase() === 'application' : false
      );

      if (relatedApp?.to) {
        context.applicationId = relatedApp.to.id ?? context.applicationId;
        context.applicationSlug = relatedApp.to.shortId ?? context.applicationSlug;

        if (relatedApp.to.id) {
          details = await this.fetchEntityGraphQL({ id: relatedApp.to.id }, 'application');
        } else if (relatedApp.to.shortId) {
          details = await this.fetchEntityGraphQL({ shortId: relatedApp.to.shortId }, 'application');
        }
      }
    }

    if (details) {
      this.logger.debug('Found application entity', {
        id: details.entity.id ?? '(none)',
        shortId: details.entity.shortId ?? '(none)',
      });

      context.applicationId = details.entity.id ?? context.applicationId;
      context.applicationSlug = details.entity.shortId ?? context.applicationSlug;
    } else {
      this.logger.debug('No application found');
    }

    return details;
  }

  /**
   * Fetches an entity by GraphQL criteria
   */
  private async fetchEntityGraphQL(
    criteria: { id?: string; shortId?: string },
    expectedType: string
  ): Promise<GraphEntityDetails | undefined> {
    try {
      if (criteria.id) {
        const data = await this.graphqlClient.query<EntityByIdResponse>(
          `
            query EntityById($id: ID!) {
              entity(id: $id) {
                id
                shortId
                name
                description
                type
                attributes {
                  field
                  value
                }
                relationships {
                  to {
                    id
                    shortId
                    name
                    type
                  }
                }
              }
            }
          `,
          { id: criteria.id }
        );

        if (data.data?.entity) {
          return this.toEntityDetails(data.data.entity);
        }
      }

      if (criteria.shortId) {
        const entity = await this.fetchEntityByShortIdDirect(criteria.shortId, expectedType);
        if (entity) {
          return this.toEntityDetails(entity);
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to fetch entity by GraphQL', error as Error, {
        criteria,
        expectedType,
      });
      throw new ApiError('Failed to fetch entity', {
        criteria,
        expectedType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetches entity by short ID directly
   */
  private async fetchEntityByShortIdDirect(
    shortId: string,
    expectedType: string
  ): Promise<GraphEntity | undefined> {
    try {
      const data = await this.graphqlClient.query<EntityByShortIdResponse>(
        `
          query EntityByShortId($shortId: String!, $type: String!) {
            allEntities(filter: { shortId: $shortId, type: $type }) {
              id
              shortId
              name
              description
              type
              attributes {
                field
                value
              }
              relationships {
                to {
                  id
                  shortId
                  name
                  type
                }
              }
            }
          }
        `,
        { shortId, type: expectedType }
      );

      const entities = data.data?.allEntities ?? [];
      const matchedEntity = entities.find((entity) => entity && this.matchesEntity(entity, shortId, expectedType));

      if (matchedEntity) {
        this.logger.debug('Found entity by shortId', {
          id: matchedEntity.id ?? '(none)',
          shortId: matchedEntity.shortId ?? '(none)',
          type: matchedEntity.type ?? '(none)',
        });
      } else {
        this.logger.debug('No entity found for shortId', {
          shortId,
          expectedType,
        });
      }

      return matchedEntity ?? undefined;
    } catch (error) {
      this.logger.error('Failed to fetch entity by shortId', error as Error, {
        shortId,
        expectedType,
      });
      throw new ApiError('Failed to fetch entity by shortId', {
        shortId,
        expectedType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetches repository by URL
   */
  private async fetchRepositoryByUrl(url: string): Promise<GraphEntityDetails | undefined> {
    try {
      const searchTerms = [
        convertToHttpsUrl(url), // HTTPS URL without .git
        url, // Original URL
        extractRepoNameFromUrl(url), // Just the repo name part
        'devgrid-ui-client', // Hardcoded fallback
      ].filter(Boolean);

      this.logger.debug('Searching for repository with terms', { searchTerms });

      let repos: any[] = [];
      for (const searchTerm of searchTerms) {
        if (!searchTerm) continue;

        this.logger.debug('Trying search term', { searchTerm });

        const data = await this.graphqlClient.query<AllReposResponse>(
          `
            query AllRepos($filter: RepoFilter, $limit: Int!) {
              allRepos(filter: $filter, pagination: { limit: $limit }) {
                id
                name
                description
                url
                ignore
                readyForIntegration
                externalSystem
              }
            }
          `,
          {
            filter: {
              name: {
                query: searchTerm,
                match: 'contains',
              },
            },
            limit: 20,
          }
        );

        const foundRepos = data.data?.allRepos ?? [];
        this.logger.debug('Found repositories for term', {
          count: foundRepos.length,
          searchTerm,
        });

        if (foundRepos.length > 0) {
          repos = foundRepos;
          break; // Use the first search that returns results
        }
      }

      this.logger.debug('Final result', { count: repos.length });

      // Debug: Log the repository names to see what's available
      if (repos.length > 0) {
        this.logger.debug('Available repositories');
        repos.forEach((repo, index) => {
          this.logger.debug(`Repository ${index + 1}`, {
            name: repo.name,
            url: repo.url || '(none)',
          });
        });
      }

      // Find repository by exact URL match
      const httpsUrl = convertToHttpsUrl(url);
      for (const repo of repos) {
        if (repo?.url) {
          const repoHttpsUrl = convertToHttpsUrl(repo.url);
          if (repoHttpsUrl === httpsUrl) {
            this.logger.debug('Found matching repository', {
              name: repo.name,
              url: repo.url,
            });

            return this.toEntityDetails({
              id: repo.id,
              shortId: repo.name,
              name: repo.name,
              description: repo.description,
              type: 'repo',
              attributes: [
                { field: 'url', value: repo.url },
                { field: 'externalSystem', value: repo.externalSystem },
              ],
              relationships: [],
            });
          }
        }
      }

      this.logger.debug('No repository found with URL', { url });
      return undefined;
    } catch (error) {
      this.logger.error('Error searching repositories', error as Error, { url });
      throw new ApiError('Failed to search repositories by URL', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets Git remote URL
   */
  private async getGitRemoteUrl(): Promise<string | undefined> {
    try {
      const workspaceFolder = process.cwd(); // This should be injected in real implementation
      return await this.gitService.getRemoteUrl(workspaceFolder);
    } catch (error) {
      this.logger.debug('Failed to get Git remote URL', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Converts GraphEntity to GraphEntityDetails
   */
  private toEntityDetails(entity: GraphEntity): GraphEntityDetails {
    this.logger.debug('Processing entity', {
      rawId: entity.id ?? '(none)',
      rawShortId: entity.shortId ?? '(none)',
      type: entity.type ?? '(none)',
    });

    const attributes = new Map<string, unknown>();
    for (const attribute of entity.attributes ?? []) {
      if (attribute?.field) {
        attributes.set(attribute.field, attribute.value);
      }
    }

    const relationships = (entity.relationships ?? []).filter((rel): rel is NonNullable<typeof rel> => rel !== null);

    const result: GraphEntityDetails = {
      entity: {
        id: entity.id,
        shortId: entity.shortId,
        name: entity.name,
        description: entity.description,
        type: entity.type,
      },
      attributes,
      relationships,
    };

    this.logger.debug('Final result', {
      id: result.entity.id ?? '(none)',
      shortId: result.entity.shortId ?? '(none)',
      name: result.entity.name ?? '(none)',
    });

    return result;
  }

  /**
   * Checks if entity matches criteria
   */
  private matchesEntity(entity: GraphEntity, shortId: string, expectedType: string): boolean {
    if (!entity) {
      return false;
    }

    const normalizedShortId = shortId.toLowerCase().trim();
    const normalizedExpectedType = expectedType.toLowerCase().trim();

    // Check direct shortId match
    if (entity.shortId?.toLowerCase().trim() === normalizedShortId) {
      return true;
    }

    // Check type match
    if (entity.type?.toLowerCase().trim() !== normalizedExpectedType) {
      return false;
    }

    // Check attribute matches
    for (const attribute of entity.attributes ?? []) {
      if (!attribute?.field || !attribute.value) {
        continue;
      }

      const field = attribute.field.toLowerCase();
      const value = this.attributeValueToString(attribute.value);

      if (field === 'shortid' && value === normalizedShortId) {
        return true;
      }

      if (field === 'alt' && value === normalizedShortId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Converts attribute value to string
   */
  private attributeValueToString(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  /**
   * Converts GraphEntityDetails to DevGridEntitySummary
   */
  toEntitySummary(details: GraphEntityDetails): DevGridEntitySummary {
    return {
      id: details.entity.id ?? undefined,
      slug: details.entity.shortId ?? undefined,
      name: details.entity.name ?? undefined,
      description: details.entity.description ?? undefined,
    };
  }

  /**
   * Converts GraphEntityDetails to repository summary
   */
  toRepositorySummary(details: GraphEntityDetails): DevGridEntitySummary {
    return {
      id: details.entity.id ?? undefined,
      slug: details.entity.shortId ?? undefined,
      name:
        details.entity.name ??
        details.entity.shortId ??
        this.attributeValueToString(details.attributes.get('name')) ??
        'Repository',
      url: this.attributeValueToString(details.attributes.get('repositoryUrl')) ||
        this.attributeValueToString(details.attributes.get('url')) ||
        undefined,
      description:
        details.entity.description ??
        this.attributeValueToString(details.attributes.get('description')) ??
        undefined,
    };
  }

  /**
   * Converts GraphEntityDetails to application summary
   */
  toApplicationSummary(details: GraphEntityDetails): DevGridEntitySummary {
    return {
      id: details.entity.id ?? undefined,
      slug: details.entity.shortId ?? undefined,
      name:
        details.entity.name ??
        details.entity.shortId ??
        this.attributeValueToString(details.attributes.get('name')) ??
        'Application',
      description:
        details.entity.description ??
        this.attributeValueToString(details.attributes.get('description')) ??
        undefined,
    };
  }
}
