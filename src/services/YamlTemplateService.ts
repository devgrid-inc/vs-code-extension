import { existsSync } from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { getRemoteUrl, getRepositoryRoot } from '../gitUtils';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { ILogger } from '../interfaces/ILogger';
// Note: DevGridFileConfig and DevGridProjectComponentConfig are not directly used but kept for future use
import { convertToHttpsUrl } from '../utils/urlUtils';


interface RepositoryInfo {
  id?: string;
  slug?: string;
  name?: string;
  components?: ComponentInfo[];
}

interface ComponentInfo {
  id?: string;
  slug?: string;
  shortId?: string;
  name?: string;
  applicationId?: string;
  applicationSlug?: string;
  appId?: string | number;
}

interface AllReposResponse {
  allRepos: Array<{
    id: string;
    name: string;
    url?: string;
    components?: Array<{
      id: string;
      shortId?: string;
      name?: string;
    }>;
  }>;
}

interface EntityResponse {
  entity: {
    id?: string;
    shortId?: string;
    name?: string;
    relationships?: Array<{
      to?: {
        id?: string;
        shortId?: string;
        name?: string;
        type?: string;
      };
    }>;
  };
}

interface ApplicationResponse {
  application: {
    id?: string;
    slug?: string;
    appId?: string | number;
  };
}

/**
 * Service for generating DevGrid YAML templates
 */
export class YamlTemplateService {
  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(
    private graphqlClient: IGraphQLClient,
    private logger: ILogger
  ) {}

  /**
   * Generates a YAML template for the workspace
   * Attempts to pre-fill values from DevGrid API if repository is connected
   */
  async generateTemplate(): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.generateEmptyTemplate();
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const repositoryRoot = await getRepositoryRoot(workspacePath);
    const projectRoot = repositoryRoot ?? workspacePath;

    // Try to detect repository and components from DevGrid
    let repoInfo: RepositoryInfo | undefined;
    try {
      repoInfo = await this.detectRepositoryFromGit(projectRoot);
      if (repoInfo?.components && repoInfo.components.length > 0) {
        // Enrich components with application info
        for (const component of repoInfo.components) {
          if (component.id) {
            const appInfo = await this.getApplicationFromComponent(component.id);
            if (appInfo) {
              component.applicationId = appInfo.id;
              component.applicationSlug = appInfo.slug;
              component.appId = appInfo.appId;
            }
          }
        }
      }
    } catch (error) {
      this.logger.debug('Failed to detect repository from DevGrid', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with empty template
    }

    return this.generateTemplateFromInfo(repoInfo, projectRoot);
  }

  /**
   * Detects repository information from git remote URL
   */
  private async detectRepositoryFromGit(projectRoot: string): Promise<RepositoryInfo | undefined> {
    const remoteUrl = await getRemoteUrl(projectRoot);
    if (!remoteUrl) {
      this.logger.debug('No git remote URL found');
      return undefined;
    }

    const normalizedUrl = convertToHttpsUrl(remoteUrl);
    this.logger.debug('Searching for repository by URL', {
      originalUrl: remoteUrl,
      normalizedUrl,
    });

    try {
      // Use same pattern as EntityResolver - API accepts url filter even if not in schema
      const variables: Record<string, unknown> = {
        filter: {
          url: {
            query: normalizedUrl,
          },
        },
      };

      const data = await this.graphqlClient.query<AllReposResponse>(
        `
          query FindRepositoryByUrl($filter: RepoFilter) {
            allRepos(filter: $filter, pagination: { limit: 1 }) {
              id
              name
              url
              components {
                id
                shortId
                name
              }
            }
          }
        `,
        variables
      );

      const repos = data.data?.allRepos ?? [];
      if (repos.length === 0) {
        this.logger.debug('No repository found in DevGrid with this URL');
        return undefined;
      }

      const repo = repos[0];
      if (!repo) {
        return undefined;
      }

      this.logger.info('Found repository in DevGrid', {
        id: repo.id,
        name: repo.name,
        componentCount: repo.components?.length ?? 0,
      });

      const components: ComponentInfo[] =
        repo.components?.map(comp => ({
          id: comp.id,
          shortId: comp.shortId,
          name: comp.name,
        })) ?? [];

      return {
        id: repo.id,
        name: repo.name,
        components,
      };
    } catch (error) {
      this.logger.warn('Error querying DevGrid for repository', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Gets application information from a component ID
   */
  private async getApplicationFromComponent(
    componentId: string
  ): Promise<{ id?: string; slug?: string; appId?: string | number } | undefined> {
    try {
      // First, get the component entity with its relationships
      const componentData = await this.graphqlClient.query<EntityResponse>(
        `
          query GetComponent($id: ID!) {
            entity(id: $id) {
              id
              shortId
              name
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
        { id: componentId }
      );

      const entity = componentData.data?.entity;
      if (!entity) {
        return undefined;
      }

      // Find application relationship
      const appRelationship = entity.relationships?.find(
        rel => rel.to?.type?.toLowerCase() === 'application'
      );

      if (!appRelationship?.to?.id) {
        return undefined;
      }

      // Get application details
      const appData = await this.graphqlClient.query<ApplicationResponse>(
        `
          query GetApplication($id: ID!) {
            application(id: $id) {
              id
              slug
              appId
            }
          }
        `,
        { id: appRelationship.to.id }
      );

      const application = appData.data?.application;
      if (!application) {
        return undefined;
      }

      return {
        id: application.id,
        slug: application.slug,
        appId: application.appId,
      };
    } catch (error) {
      this.logger.debug('Error fetching application from component', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Generates YAML template from detected repository info
   */
  private generateTemplateFromInfo(
    repoInfo: RepositoryInfo | undefined,
    projectRoot: string
  ): string {
    const hasDetectedData = repoInfo?.components && repoInfo.components.length > 0;
    const detectedComment = hasDetectedData
      ? 'DevGrid Configuration (auto-detected from your repository)'
      : 'DevGrid Configuration';

    let yaml = `# ${detectedComment}
# Documentation: https://docs.devgrid.io/docs/devgrid-project-yaml
#
# IMPORTANT: Replace the ****** placeholders below with actual values from the DevGrid app.
# Get these values by:
#   1. Go to https://app.devgrid.io
#   2. Navigate to your Application → Components
#   3. Copy the appId and component shortId values

project:
`;

    if (hasDetectedData && repoInfo.components) {
      // Use detected appId from first component (they should all share the same app)
      const firstComponent = repoInfo.components[0];
      const {appId} = firstComponent;

      if (appId !== undefined && appId !== null) {
        const appIdStr = typeof appId === 'string' ? `"${appId}"` : String(appId);
        yaml += `  appId: ${appIdStr}\n`;
      } else {
        yaml += `  appId: "******"  # Replace with your application ID from DevGrid app\n`;
      }

      yaml += `  components:\n`;

      // Detect manifest files in project root
      const manifestCandidates = [
        'package.json',
        'pom.xml',
        'requirements.txt',
        'setup.py',
        'Cargo.toml',
        'go.mod',
        'build.gradle',
      ];

      for (const component of repoInfo.components) {
        yaml += `  - name: ${component.name || 'my-component'}\n`;

        if (component.shortId) {
          yaml += `    shortId: ${component.shortId}\n`;
        } else {
          yaml += `    shortId: "******"  # Replace with component short ID from DevGrid app\n`;
        }

        // Try to detect manifest file
        const detectedManifest = this.detectManifestFile(projectRoot, manifestCandidates);
        if (detectedManifest) {
          yaml += `    manifest: ${detectedManifest}\n`;
        } else {
          yaml += `    manifest: package.json  # Update if your manifest file has a different name\n`;
        }

        yaml += `    # api: swagger.yml  # Optional: Path to API definition\n`;
        yaml += `\n`;
      }
    } else {
      // Empty template with fail-fast placeholders
      yaml += `  appId: "******"  # Replace with your application ID from DevGrid app
  components:
  - name: my-component  # Replace with your component name
    shortId: "******"   # Replace with component short ID from DevGrid app
    manifest: package.json  # Update if your manifest file has a different name
    # api: swagger.yml  # Optional: Path to API definition
`;
    }

    return yaml;
  }

  /**
   * Generates an empty template when no workspace is available
   */
  private generateEmptyTemplate(): string {
    return `# DevGrid Configuration
# Documentation: https://docs.devgrid.io/docs/devgrid-project-yaml
#
# IMPORTANT: Replace the ****** placeholders below with actual values from the DevGrid app.
# Get these values by:
#   1. Go to https://app.devgrid.io
#   2. Navigate to your Application → Components
#   3. Copy the appId and component shortId values

project:
  appId: "******"  # Replace with your application ID from DevGrid app
  components:
  - name: my-component  # Replace with your component name
    shortId: "******"   # Replace with component short ID from DevGrid app
    manifest: package.json  # Update if your manifest file has a different name
    # api: swagger.yml  # Optional: Path to API definition
`;
  }

  /**
   * Detects which manifest file exists in the project root
   */
  private detectManifestFile(projectRoot: string, candidates: string[]): string | undefined {
    for (const candidate of candidates) {
      const fullPath = path.join(projectRoot, candidate);
      try {
        if (existsSync(fullPath)) {
          return candidate;
        }
      } catch {
        // Continue to next candidate
      }
    }
    return undefined;
  }
}
