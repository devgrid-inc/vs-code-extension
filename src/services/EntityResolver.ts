import { ApiError } from '../errors/DevGridError';
import type { IGitService } from '../interfaces/IGitService';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { ILogger } from '../interfaces/ILogger';
import type { DevGridIdentifiers, DevGridEntitySummary } from '../types';
import { convertToHttpsUrl } from '../utils/urlUtils';

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
    components?: Array<{
      id: string;
      shortId?: string;
      name?: string;
    }>;
  }>;
}

/**
 * Entity resolver service for DevGrid entities
 */
export class EntityResolver {
  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
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
        // UUID format - use entity query for UUIDs
        details = await this.fetchEntityGraphQL({ id: context.repositoryId }, 'repo');
      } else {
        // Short ID format - use allRepos query
        details = await this.fetchRepositoryByShortId(context.repositoryId);
      }
    }

    if (!details && componentDetails) {
      // First, try to get repository from component's source_code_repository attribute
      const sourceCodeRepo = componentDetails.attributes.get('source_code_repository');
      if (sourceCodeRepo) {
        const repoUrl = this.attributeValueToString(sourceCodeRepo);
        if (repoUrl) {
          // Remove .git suffix if present
          const normalizedUrl = repoUrl.replace(/\.git$/, '');
          this.logger.debug('Fetching repository by component source_code_repository', { url: normalizedUrl });
          details = await this.fetchRepositoryByUrl(normalizedUrl);
        }
      }

      // Second, try repository relationship from component
      if (!details) {
        const relatedRepo = componentDetails.relationships.find((relationship) =>
          relationship.to?.type ? relationship.to.type.toLowerCase() === 'repo' : false
        );

        if (relatedRepo?.to) {
          context.repositoryId = relatedRepo.to.id ?? context.repositoryId;
          context.repositorySlug = relatedRepo.to.shortId ?? context.repositorySlug;

          if (relatedRepo.to.id) {
            details = await this.fetchEntityGraphQL({ id: relatedRepo.to.id }, 'repo');
          } else if (relatedRepo.to.shortId) {
            details = await this.fetchRepositoryByShortId(relatedRepo.to.shortId);
          }
        }
      }
    }

    // Last resort: try git remote URL (only if we have repositorySlug but no details yet)
    if (!details && context.repositorySlug) {
      // Get Git remote URL and use it for repository lookup
      const gitRemoteUrl = await this.getGitRemoteUrl();
      if (gitRemoteUrl) {
        // Remove .git suffix if present
        const repoUrl = gitRemoteUrl.replace(/\.git$/, '');
        this.logger.debug('Fetching repository by Git remote URL', { originalUrl: gitRemoteUrl, url: repoUrl });
        details = await this.fetchRepositoryByUrl(repoUrl);
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
      // Validate shortId
      if (!shortId || typeof shortId !== 'string' || shortId.trim().length === 0) {
        this.logger.debug('Invalid shortId provided', { shortId });
        return undefined;
      }

      this.logger.debug('Fetching entity by shortId', { shortId, expectedType });

      const data = await this.graphqlClient.query<EntityByShortIdResponse>(
        `
          query EntityByShortId($shortId: String!, $type: String!) {
            allEntities(filter: { shortId: $shortId, type: [$type] }, pagination: { limit: 1 }) {
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
        { shortId: shortId.trim(), type: expectedType }
      );

      const entities = data.data?.allEntities ?? [];
      
      // Return first result (filter should return exact match, no need to loop)
      const matchedEntity = entities[0] || undefined;

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

      return matchedEntity;
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
   * Fetches repository by shortId using allRepos
   */
  private async fetchRepositoryByShortId(shortId: string): Promise<GraphEntityDetails | undefined> {
    try {
      // Validate shortId
      if (!shortId || typeof shortId !== 'string' || shortId.trim().length === 0) {
        this.logger.debug('Invalid shortId provided', { shortId });
        return undefined;
      }

      this.logger.debug('Fetching repository by shortId', { shortId });

      const data = await this.graphqlClient.query<AllReposResponse>(
        `
          query RepositoryByShortId($filter: RepoFilter) {
            allRepos(filter: $filter, pagination: { limit: 1 }) {
              id
              name
              description
              url
              ignore
              readyForIntegration
              externalSystem
              components {
                id
                shortId
                name
              }
            }
          }
        `,
        {
          filter: {
            name: {
              query: shortId.trim(),
            },
          },
        }
      );

      const repos = data.data?.allRepos ?? [];
      
      // Return first result
      const repo = repos[0] || undefined;

      if (repo) {
        this.logger.debug('Found repository by shortId', {
          id: repo.id,
          name: repo.name,
          url: repo.url || '(none)',
        });

        const details = this.toEntityDetails({
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
        
        // Store components for linkage checking
        if (repo.components && repo.components.length > 0) {
          details.attributes.set('_components', repo.components);
        }
        
        return details;
      } else {
        this.logger.debug('No repository found for shortId', { shortId });
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to fetch repository by shortId', error as Error, {
        shortId,
      });
      throw new ApiError('Failed to fetch repository by shortId', {
        shortId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetches repository by URL
   */
  private async fetchRepositoryByUrl(url: string): Promise<GraphEntityDetails | undefined> {
    try {
      // Validate URL format
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        this.logger.debug('Invalid URL provided', { url });
        return undefined;
      }

      // Normalize URL: convert SSH to HTTPS (no .git handling needed per user requirements)
      const normalizedUrl = convertToHttpsUrl(url.trim());
      this.logger.debug('Searching for repository by URL', { originalUrl: url, normalizedUrl });

      // Single query with URL filter
      const data = await this.graphqlClient.query<AllReposResponse>(
        `
          query AllRepos($filter: RepoFilter) {
            allRepos(filter: $filter, pagination: { limit: 1 }) {
              id
              name
              description
              url
              ignore
              readyForIntegration
              externalSystem
              components {
                id
                shortId
                name
              }
            }
          }
        `,
        {
          filter: {
            url: {
              query: normalizedUrl,
            },
          },
        }
      );

      const repos = data.data?.allRepos ?? [];
      
      if (repos.length === 0) {
        this.logger.debug('No repository found with URL', { url: normalizedUrl });
        return undefined;
      }

      // Return first result (filter should return exact match)
      const repo = repos[0];
      if (!repo) {
        this.logger.debug('Repository result is null/undefined');
        return undefined;
      }

      this.logger.debug('Found matching repository', {
        id: repo.id,
        name: repo.name,
        url: repo.url,
      });

      const details = this.toEntityDetails({
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
      
      // Store components for linkage checking
      if (repo.components && repo.components.length > 0) {
        details.attributes.set('_components', repo.components);
      }
      
      return details;
    } catch (error) {
      this.logger.error('Error fetching repository by URL', error as Error, { url });
      throw new ApiError('Failed to fetch repository by URL', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets Git remote URL
   * Note: This may fail in some IDEs (like Cursor) if vscode module is not available
   */
  private async getGitRemoteUrl(): Promise<string | undefined> {
    try {
      // Try to get workspace folder path from VS Code
      // This may fail in some IDEs like Cursor where vscode module is not available
      let workspaceFolder: { uri: { fsPath: string } } | undefined;
      
      try {
        const vscode = await import('vscode');
        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      } catch (importError) {
        // vscode module not available (e.g., in Cursor or other IDEs)
        this.logger.debug('Cannot import vscode module, skipping git remote URL lookup', {
          error: importError instanceof Error ? importError.message : String(importError),
        });
        return undefined;
      }

      if (!workspaceFolder) {
        this.logger.debug('No workspace folder found, cannot get remote URL');
        return undefined;
      }

      const startPath = workspaceFolder.uri.fsPath;
      this.logger.debug('Finding git repository root', { startPath });
      
      const repositoryRoot = await this.gitService.getRepositoryRoot(startPath);
      if (!repositoryRoot) {
        this.logger.debug('Not in a git repository, cannot get remote URL', { startPath });
        return undefined;
      }

      this.logger.debug('Found git repository root', { repositoryRoot });
      
      // Now get the remote URL from the repository root
      const remoteUrl = await this.gitService.getRemoteUrl(repositoryRoot);
      if (remoteUrl) {
        this.logger.debug('Found git remote URL', { repositoryRoot, remoteUrl });
      } else {
        this.logger.debug('No remote URL found', { repositoryRoot });
      }
      
      return remoteUrl;
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
   * Checks if a component is linked to a repository
   */
  checkRepoComponentLinkage(
    componentId: string | undefined,
    repositoryDetails: GraphEntityDetails | undefined
  ): { linked: boolean | null; message: string } {
    if (!componentId || !repositoryDetails) {
      return {
        linked: null,
        message: 'Unable to verify linkage - missing component or repository information',
      };
    }

    const components = repositoryDetails.attributes.get('_components');
    if (!components || !Array.isArray(components)) {
      return {
        linked: null,
        message: 'Unable to verify linkage - repository components information not available',
      };
    }

    const isLinked = (components as Array<{ id: string }>).some((c) => c.id === componentId);

    return {
      linked: isLinked,
      message: isLinked
        ? 'Repository and component are properly linked'
        : 'Repository and component are not linked in DevGrid',
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
