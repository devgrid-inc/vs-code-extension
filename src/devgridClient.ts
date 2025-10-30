import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import { URL } from "url";
import {
  DevGridDependency,
  DevGridEndpointTemplates,
  DevGridEntitySummary,
  DevGridIncident,
  DevGridInsightBundle,
  DevGridIdentifiers,
  DevGridVulnerability,
} from "./types";
import { deriveRepositorySlug } from "./gitUtils";

const DEFAULT_ENDPOINTS: Required<Pick<DevGridEndpointTemplates, "graphql">> = {
  graphql: "/graphql",
};

export interface DevGridClientOptions {
  apiBaseUrl: string;
  accessToken?: string;
  maxItems: number;
  endpoints?: DevGridEndpointTemplates;
  outputChannel?: vscode.OutputChannel;
}

type HttpModule = typeof https | typeof http;

export class DevGridClient {
  private readonly apiBaseUrl: string;
  private readonly accessToken?: string;
  private readonly maxItems: number;
  private readonly endpoints: DevGridEndpointTemplates;
  private readonly outputChannel?: vscode.OutputChannel;
  private readonly graphqlEndpoint?: string;

  constructor(options: DevGridClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.accessToken = options.accessToken;
    this.maxItems = options.maxItems;
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
    this.outputChannel = options.outputChannel;
    this.graphqlEndpoint = this.resolveGraphQLEndpoint();
  }

  async fetchInsights(
    identifiers: DevGridIdentifiers
  ): Promise<DevGridInsightBundle> {
    const context = { ...identifiers };
    const bundle: DevGridInsightBundle = {
      application: undefined,
      component: undefined,
      repository: undefined,
      vulnerabilities: [],
      incidents: [],
      dependencies: [],
    };

    const componentDetails = await this.loadComponentDetails(context);
    if (!componentDetails) {
      this.logTrace(
        "[DevGrid] Component details not found; returning empty insights bundle"
      );
      return bundle;
    }

    bundle.component = this.toComponentSummary(componentDetails);

    // Load repository details to get repositoryId for vulnerability search
    const repositoryDetails = await this.loadRepositoryDetails(
      context,
      componentDetails
    );
    if (repositoryDetails) {
      bundle.repository = this.toRepositorySummary(repositoryDetails);
    } else {
      const repository = this.buildRepositorySummary(componentDetails, context);
      if (repository) {
        bundle.repository = repository;
      }
    }

    const applicationDetails = await this.loadApplicationDetails(
      context,
      componentDetails
    );
    if (applicationDetails) {
      bundle.application = this.toApplicationSummary(applicationDetails);
    } else {
      const applicationFallback = this.buildApplicationSummaryFromComponent(
        componentDetails,
        context
      );
      if (applicationFallback) {
        bundle.application = applicationFallback;
      }
    }

    bundle.dependencies = this.buildDependencies(componentDetails).slice(
      0,
      this.maxItems
    );

    const componentId = context.componentId;
    const repositoryId = context.repositoryId;
    if (componentId || repositoryId) {
      bundle.vulnerabilities = (
        await this.fetchVulnerabilities(componentId, repositoryId)
      ).slice(0, this.maxItems);
    }

    const incidentEntityId =
      context.applicationId ?? context.componentId ?? undefined;
    if (incidentEntityId) {
      bundle.incidents = (await this.fetchIncidents(incidentEntityId)).slice(
        0,
        this.maxItems
      );
    }

    return bundle;
  }

  private async loadComponentDetails(
    context: DevGridIdentifiers
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    if (context.componentId) {
      details = await this.fetchEntityGraphQL(
        { id: context.componentId },
        "component"
      );
    }

    if (!details && context.componentSlug) {
      details = await this.fetchEntityGraphQL(
        { shortId: context.componentSlug },
        "component"
      );
    }

    if (!details) {
      return undefined;
    }

    this.logTrace(
      `[DevGrid:loadComponentDetails] Found component entity: id=${
        details.entity.id ?? "(none)"
      } shortId=${details.entity.shortId ?? "(none)"}`
    );

    context.componentId = details.entity.id ?? context.componentId;
    context.componentSlug = details.entity.shortId ?? context.componentSlug;

    this.logTrace(
      `[DevGrid:loadComponentDetails] Updated context: componentId=${
        context.componentId ?? "(none)"
      } componentSlug=${context.componentSlug ?? "(none)"}`
    );

    return details;
  }

  private async loadRepositoryDetails(
    context: DevGridIdentifiers,
    componentDetails?: GraphEntityDetails
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    this.logTrace(
      `[DevGrid:loadRepositoryDetails] Starting with repositoryId=${
        context.repositoryId ?? "(none)"
      } repositorySlug=${context.repositorySlug ?? "(none)"}`
    );

    // First try to find by repositoryId (if it's already a UUID)
    if (context.repositoryId) {
      // Check if it looks like a UUID (contains hyphens)
      if (context.repositoryId.includes("-")) {
        details = await this.fetchEntityGraphQL(
          { id: context.repositoryId },
          "repo"
        );
      } else {
        // If it doesn't look like a UUID, treat it as a shortId
        details = await this.fetchEntityGraphQL(
          { shortId: context.repositoryId },
          "repo"
        );
      }
    }

    if (!details && context.repositorySlug) {
      // First try to find by shortId
      details = await this.fetchEntityGraphQL(
        { shortId: context.repositorySlug },
        "repo"
      );

      // If not found by shortId, try to find by URL
      if (!details) {
        const gitRemoteUrl = await this.getGitRemoteUrl();
        if (gitRemoteUrl) {
          this.logTrace(
            `[DevGrid:loadRepositoryDetails] Searching repositories by URL: ${gitRemoteUrl}`
          );
          details = await this.fetchRepositoryByUrl(gitRemoteUrl);
        }
      }
    }

    if (!details && componentDetails) {
      const relatedRepo = componentDetails.relationships.find((relationship) =>
        relationship.to?.type
          ? relationship.to.type.toLowerCase() === "repo"
          : false
      );
      if (relatedRepo?.to) {
        context.repositoryId = relatedRepo.to.id ?? context.repositoryId;
        context.repositorySlug =
          relatedRepo.to.shortId ?? context.repositorySlug;
        if (relatedRepo.to.id) {
          details = await this.fetchEntityGraphQL(
            { id: relatedRepo.to.id },
            "repo"
          );
        } else if (relatedRepo.to.shortId) {
          details = await this.fetchEntityGraphQL(
            { shortId: relatedRepo.to.shortId },
            "repo"
          );
        }
      }
    }

    if (details) {
      this.logTrace(
        `[DevGrid:loadRepositoryDetails] Found repository: id=${
          details.entity.id ?? "(none)"
        } shortId=${details.entity.shortId ?? "(none)"} name=${
          details.entity.name ?? "(none)"
        }`
      );

      context.repositoryId = details.entity.id ?? context.repositoryId;
      context.repositorySlug = details.entity.shortId ?? context.repositorySlug;

      this.logTrace(
        `[DevGrid:loadRepositoryDetails] Updated context: repositoryId=${
          context.repositoryId ?? "(none)"
        } repositorySlug=${context.repositorySlug ?? "(none)"}`
      );
    } else {
      this.logTrace(`[DevGrid:loadRepositoryDetails] No repository found`);
    }

    return details;
  }

  private async getGitRemoteUrl(): Promise<string | undefined> {
    try {
      // Import gitUtils dynamically to avoid circular dependencies
      const { getRemoteUrl } = await import("./gitUtils");
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return undefined;
      }
      return await getRemoteUrl(workspaceFolder.uri.fsPath);
    } catch (error) {
      this.logTrace(
        `[DevGrid:getGitRemoteUrl] Failed to get Git remote URL: ${error}`
      );
      return undefined;
    }
  }

  private async fetchRepositoryByUrl(
    url: string
  ): Promise<GraphEntityDetails | undefined> {
    try {
      // Try multiple search strategies
      const httpsUrl = this.convertToHttpsUrl(url);
      const searchTerms = [
        httpsUrl, // HTTPS URL without .git
        url, // Original URL
        this.extractRepoNameFromUrl(url), // Just the repo name part
        "devgrid-ui-client", // Hardcoded fallback
      ].filter(Boolean);

      this.logTrace(
        `[DevGrid:fetchRepositoryByUrl] Searching for repository with terms: ${searchTerms.join(
          ", "
        )}`
      );

      let repos: any[] = [];
      for (const searchTerm of searchTerms) {
        if (!searchTerm) continue;

        this.logTrace(
          `[DevGrid:fetchRepositoryByUrl] Trying search term: "${searchTerm}"`
        );

        const data = await this.executeGraphQL<AllReposResponse>(
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
                match: "contains",
              },
            },
            limit: 20,
          }
        );

        const foundRepos = data?.allRepos ?? [];
        this.logTrace(
          `[DevGrid:fetchRepositoryByUrl] Found ${foundRepos.length} repositories for term "${searchTerm}"`
        );

        if (foundRepos.length > 0) {
          repos = foundRepos;
          break; // Use the first search that returns results
        }
      }

      this.logTrace(
        `[DevGrid:fetchRepositoryByUrl] Final result: Found ${repos.length} repositories`
      );

      // Debug: Log the repository names to see what's available
      if (repos.length > 0) {
        this.logTrace(`[DevGrid:fetchRepositoryByUrl] Available repositories:`);
        repos.forEach((repo, index) => {
          this.logTrace(
            `[DevGrid:fetchRepositoryByUrl]   ${index + 1}. name="${
              repo.name
            }" url="${repo.url || "(none)"}"`
          );
        });
      }

      // Find repository by exact URL match
      for (const repo of repos) {
        if (repo?.url) {
          const repoHttpsUrl = this.convertToHttpsUrl(repo.url);
          if (repoHttpsUrl === httpsUrl) {
            this.logTrace(
              `[DevGrid:fetchRepositoryByUrl] Found matching repository: ${repo.name} (${repo.url})`
            );
            return this.toEntityDetails({
              id: repo.id,
              shortId: repo.name,
              name: repo.name,
              description: repo.description,
              type: "repo",
              attributes: [
                { field: "url", value: repo.url },
                { field: "externalSystem", value: repo.externalSystem },
              ],
              relationships: [],
            });
          }
        }
      }

      this.logTrace(
        `[DevGrid:fetchRepositoryByUrl] No repository found with URL: ${url}`
      );
      return undefined;
    } catch (error) {
      this.logTrace(
        `[DevGrid:fetchRepositoryByUrl] Error searching repositories: ${error}`
      );
      return undefined;
    }
  }

  private extractRepoNameFromUrl(url: string): string | undefined {
    try {
      // Handle SSH URLs: git@github.com:org/repo.git
      if (url.startsWith("git@")) {
        const match = url.match(/git@[^:]+:([^/]+\/[^/]+)(?:\.git)?$/);
        return match ? match[1] : undefined;
      }

      // Handle HTTPS URLs: https://github.com/org/repo.git
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname
        .split("/")
        .filter((part) => part.length > 0);
      if (pathParts.length >= 2) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }

      return undefined;
    } catch (error) {
      this.logTrace(
        `[DevGrid:extractRepoNameFromUrl] Error parsing URL: ${url}, error: ${error}`
      );
      return undefined;
    }
  }

  private convertToHttpsUrl(url: string): string {
    // Convert SSH URL to HTTPS URL
    // git@github.com:org/repo.git -> https://github.com/org/repo
    // https://github.com/org/repo.git -> https://github.com/org/repo
    if (url.startsWith("git@")) {
      return url
        .replace("git@", "https://")
        .replace(":", "/")
        .replace(/\.git$/, "");
    }
    return url.replace(/\.git$/, "");
  }

  private async loadApplicationDetails(
    context: DevGridIdentifiers,
    componentDetails?: GraphEntityDetails
  ): Promise<GraphEntityDetails | undefined> {
    let details: GraphEntityDetails | undefined;

    this.logTrace(
      `[DevGrid:loadApplicationDetails] Starting with applicationId=${
        context.applicationId ?? "(none)"
      } applicationSlug=${context.applicationSlug ?? "(none)"}`
    );

    // First try to find by applicationId (if it's already a UUID)
    if (context.applicationId) {
      // Check if it looks like a UUID (contains hyphens)
      if (context.applicationId.includes("-")) {
        details = await this.fetchEntityGraphQL(
          { id: context.applicationId },
          "application"
        );
      } else {
        // If it doesn't look like a UUID, treat it as a shortId/appId
        details = await this.fetchEntityGraphQL(
          { shortId: context.applicationId },
          "application"
        );
      }
    }

    if (!details && context.applicationSlug) {
      details = await this.fetchEntityGraphQL(
        { shortId: context.applicationSlug },
        "application"
      );
    }

    if (!details && componentDetails) {
      const relatedApp = componentDetails.relationships.find((relationship) =>
        relationship.to?.type
          ? relationship.to.type.toLowerCase() === "application"
          : false
      );
      if (relatedApp?.to) {
        context.applicationId = relatedApp.to.id ?? context.applicationId;
        context.applicationSlug =
          relatedApp.to.shortId ?? context.applicationSlug;
        if (relatedApp.to.id) {
          details = await this.fetchEntityGraphQL(
            { id: relatedApp.to.id },
            "application"
          );
        } else if (relatedApp.to.shortId) {
          details = await this.fetchEntityGraphQL(
            { shortId: relatedApp.to.shortId },
            "application"
          );
        }
      }
    }

    if (details) {
      this.logTrace(
        `[DevGrid:loadApplicationDetails] Found application: id=${
          details.entity.id ?? "(none)"
        } shortId=${details.entity.shortId ?? "(none)"} name=${
          details.entity.name ?? "(none)"
        }`
      );

      context.applicationId = details.entity.id ?? context.applicationId;
      context.applicationSlug =
        details.entity.shortId ?? context.applicationSlug;

      this.logTrace(
        `[DevGrid:loadApplicationDetails] Updated context: applicationId=${
          context.applicationId ?? "(none)"
        } applicationSlug=${context.applicationSlug ?? "(none)"}`
      );
    } else {
      this.logTrace(`[DevGrid:loadApplicationDetails] No application found`);
    }

    return details;
  }

  private async fetchEntityGraphQL(
    criteria: { id?: string; shortId?: string },
    entityType: string
  ): Promise<GraphEntityDetails | undefined> {
    if (!this.graphqlEndpoint) {
      this.logTrace("[DevGrid:graphql] GraphQL endpoint not configured");
      return undefined;
    }

    try {
      if (criteria.id) {
        const data = await this.executeGraphQL<EntityByIdResponse>(
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
                  type
                  to {
                    id
                    shortId
                    name
                    description
                    type
                  }
                }
              }
            }
          `,
          { id: criteria.id }
        );

        return this.toEntityDetails(data?.entity);
      }

      if (criteria.shortId) {
        const entity = await this.fetchEntityByShortIdDirect(
          criteria.shortId,
          entityType
        );
        if (entity) {
          return this.toEntityDetails(entity);
        }

        const fallback = await this.searchEntitiesByType(
          entityType,
          criteria.shortId
        );
        if (fallback) {
          return this.toEntityDetails(fallback);
        }
      }
    } catch (error) {
      this.logError("graphql", error);
    }

    return undefined;
  }

  private async fetchEntityByShortIdDirect(
    shortId: string,
    expectedType?: string
  ): Promise<GraphEntity | undefined> {
    const data = await this.executeGraphQL<EntityByShortIdResponse>(
      `
        query EntityByShortId($shortId: String!) {
          allEntities(
            filter: {
              attributes: [{ field: "shortId", value: $shortId }]
            }
            pagination: { limit: 10 }
          ) {
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
              type
              to {
                id
                shortId
                name
                description
                type
              }
            }
          }
        }
      `,
      { shortId }
    );

    const entities = data?.allEntities ?? [];
    const matchedEntity = entities.find((entity) =>
      entityMatchesShortId(entity, shortId, expectedType)
    );

    if (matchedEntity) {
      this.logTrace(
        `[DevGrid:fetchEntityByShortIdDirect] Found entity: id=${
          matchedEntity.id ?? "(none)"
        } shortId=${matchedEntity.shortId ?? "(none)"} type=${
          matchedEntity.type ?? "(none)"
        }`
      );
    } else {
      this.logTrace(
        `[DevGrid:fetchEntityByShortIdDirect] No entity found for shortId=${shortId} expectedType=${expectedType}`
      );
    }

    return matchedEntity ?? undefined;
  }

  private async searchEntitiesByType(
    entityType: string,
    shortId: string,
    limit = 100,
    maxPages = 5
  ): Promise<GraphEntity | undefined> {
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      this.logTrace(
        `[DevGrid:graphql] searching ${entityType} page=${page} offset=${offset}`
      );
      const data = await this.executeGraphQL<EntitySearchResponse>(
        `
          query EntitiesByType($type: String!, $limit: Int!, $offset: Int!) {
            allEntities(
              filter: { type: [$type] }
              pagination: { limit: $limit, offset: $offset }
            ) {
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
                type
                to {
                  id
                  shortId
                  name
                  description
                  type
                }
              }
            }
          }
        `,
        { type: entityType, limit, offset }
      );

      const entities = data?.allEntities ?? [];
      const match = entities.find((entity) =>
        entityMatchesShortId(entity, shortId, entityType)
      );
      if (match) {
        this.logTrace(
          `[DevGrid:graphql] matched ${entityType} shortId='${shortId}' on page ${page}`
        );
        return match;
      }

      if (entities.length < limit) {
        break;
      }
    }

    return undefined;
  }
  private toEntityDetails(
    entity: GraphEntity | null | undefined
  ): GraphEntityDetails | undefined {
    if (!entity) {
      return undefined;
    }

    this.logTrace(
      `[DevGrid:toEntityDetails] Processing entity: rawId=${
        entity.id ?? "(none)"
      } rawShortId=${entity.shortId ?? "(none)"} type=${
        entity.type ?? "(none)"
      }`
    );

    const attributeMap = createAttributeMap(entity);

    const relationships: GraphRelationship[] = [];
    for (const relationship of entity.relationships ?? []) {
      if (!relationship) {
        continue;
      }
      relationships.push({
        type: asString(relationship.type) ?? undefined,
        to: relationship.to
          ? {
              id: asString(relationship.to.id) ?? undefined,
              shortId: asString(relationship.to.shortId) ?? undefined,
              name: asString(relationship.to.name) ?? undefined,
              description: asString(relationship.to.description) ?? undefined,
              type: asString(relationship.to.type) ?? undefined,
            }
          : undefined,
      });
    }

    const result = {
      entity: {
        id: asString(entity.id) ?? undefined,
        shortId:
          asString(entity.shortId) ??
          attributeValueToString(attributeMap.get("shortId")) ??
          undefined,
        name:
          asString(entity.name) ??
          attributeValueToString(attributeMap.get("name")) ??
          undefined,
        description:
          asString(entity.description) ??
          attributeValueToString(attributeMap.get("description")) ??
          undefined,
        type: asString(entity.type) ?? undefined,
      },
      attributes: attributeMap,
      relationships,
    };

    this.logTrace(
      `[DevGrid:toEntityDetails] Final result: id=${
        result.entity.id ?? "(none)"
      } shortId=${result.entity.shortId ?? "(none)"} name=${
        result.entity.name ?? "(none)"
      }`
    );

    return result;
  }

  private toComponentSummary(
    details: GraphEntityDetails
  ): DevGridEntitySummary {
    return {
      id: details.entity.id,
      slug: details.entity.shortId,
      name:
        details.entity.name ??
        details.entity.shortId ??
        attributeValueToString(details.attributes.get("name")) ??
        "Component",
      url: attributeValueToString(details.attributes.get("componentUrl")),
      description:
        details.entity.description ??
        attributeValueToString(details.attributes.get("description")) ??
        undefined,
    };
  }

  private toRepositorySummary(
    details: GraphEntityDetails
  ): DevGridEntitySummary {
    return {
      id: details.entity.id,
      slug: details.entity.shortId,
      name:
        details.entity.name ??
        details.entity.shortId ??
        attributeValueToString(details.attributes.get("name")) ??
        "Repository",
      url:
        attributeValueToString(details.attributes.get("repositoryUrl")) ??
        attributeValueToString(details.attributes.get("url")),
      description:
        details.entity.description ??
        attributeValueToString(details.attributes.get("description")) ??
        undefined,
    };
  }

  private toApplicationSummary(
    details: GraphEntityDetails
  ): DevGridEntitySummary {
    return {
      id: details.entity.id,
      slug: details.entity.shortId,
      name:
        details.entity.name ??
        details.entity.shortId ??
        attributeValueToString(details.attributes.get("name")) ??
        "Application",
      url:
        attributeValueToString(details.attributes.get("applicationUrl")) ??
        attributeValueToString(details.attributes.get("dashboardUrl")) ??
        attributeValueToString(details.attributes.get("url")),
      description:
        details.entity.description ??
        attributeValueToString(details.attributes.get("description")) ??
        undefined,
    };
  }

  private buildRepositorySummary(
    details: GraphEntityDetails,
    context: DevGridIdentifiers
  ): DevGridEntitySummary | undefined {
    const repoRelationship = details.relationships.find((relationship) =>
      relationship.to?.type
        ? relationship.to.type.toLowerCase() === "repo"
        : false
    );

    const repositoryUrl =
      attributeValueToString(
        details.attributes.get("source_code_repository")
      ) ??
      attributeValueToString(details.attributes.get("repositoryUrl")) ??
      attributeValueToString(details.attributes.get("repository_url"));

    const repositorySlugFromAttr =
      attributeValueToString(details.attributes.get("repositorySlug")) ??
      attributeValueToString(details.attributes.get("repository_slug"));

    let summary: DevGridEntitySummary | undefined;

    if (repoRelationship?.to) {
      summary = this.toEntitySummary(repoRelationship.to);
    }

    if (!summary && (repositoryUrl || repositorySlugFromAttr)) {
      summary = {
        id:
          attributeValueToString(details.attributes.get("repositoryId")) ??
          attributeValueToString(details.attributes.get("repository_id")),
        slug:
          repositorySlugFromAttr ??
          (repositoryUrl ? deriveRepositorySlug(repositoryUrl) : undefined),
        name:
          repositorySlugFromAttr ??
          (repositoryUrl
            ? deriveRepositorySlug(repositoryUrl) ?? repositoryUrl
            : "Repository"),
        url: repositoryUrl,
        description: undefined,
      };
    }

    if (summary) {
      if (repositoryUrl && !summary.url) {
        summary.url = repositoryUrl;
      }
      if (summary.url && !summary.slug) {
        summary.slug = deriveRepositorySlug(summary.url);
      }
      if (!summary.slug && repositorySlugFromAttr) {
        summary.slug = repositorySlugFromAttr;
      }

      context.repositoryId = summary.id ?? context.repositoryId;
      context.repositorySlug = summary.slug ?? context.repositorySlug;
    }

    return summary;
  }

  private buildApplicationSummaryFromComponent(
    details: GraphEntityDetails,
    context: DevGridIdentifiers
  ): DevGridEntitySummary | undefined {
    const applicationRelationship = details.relationships.find((relationship) =>
      relationship.to?.type
        ? relationship.to.type.toLowerCase() === "application"
        : false
    );

    const applicationId =
      attributeValueToString(details.attributes.get("applicationId")) ??
      attributeValueToString(details.attributes.get("application_id"));

    const applicationSlug =
      attributeValueToString(details.attributes.get("applicationSlug")) ??
      attributeValueToString(details.attributes.get("application_slug"));

    let summary: DevGridEntitySummary | undefined;

    if (applicationRelationship?.to) {
      summary = this.toEntitySummary(applicationRelationship.to);
    }

    if (!summary && (applicationId || applicationSlug)) {
      summary = {
        id: applicationId ?? undefined,
        slug: applicationSlug ?? undefined,
        name: applicationSlug ?? applicationId ?? "Application",
        url: undefined,
        description: undefined,
      };
    }

    if (summary) {
      if (!summary.slug && applicationSlug) {
        summary.slug = applicationSlug;
      }
      context.applicationId = summary.id ?? context.applicationId;
      context.applicationSlug = summary.slug ?? context.applicationSlug;
    }

    return summary;
  }

  private buildDependencies(details: GraphEntityDetails): DevGridDependency[] {
    const dependencies: DevGridDependency[] = [];
    const seen = new Set<string>();

    for (const relationship of details.relationships) {
      const target = relationship.to;
      if (!target) {
        continue;
      }

      const targetType = target.type?.toLowerCase();
      if (targetType !== "component") {
        continue;
      }

      const name = target.name ?? target.shortId ?? target.id;
      const id =
        target.id ??
        target.shortId ??
        name ??
        relationship.type ??
        "dependency";

      if (!name) {
        continue;
      }

      if (id && seen.has(id)) {
        continue;
      }

      if (id) {
        seen.add(id);
      }

      dependencies.push({
        id,
        name,
        version: undefined,
        type: relationship.type ?? "component",
        latestVersion: undefined,
        url: undefined,
      });
    }

    return dependencies;
  }

  private async fetchVulnerabilities(
    componentId?: string,
    repositoryId?: string
  ): Promise<DevGridVulnerability[]> {
    if (!componentId && !repositoryId) {
      return [];
    }

    this.logTrace(
      `[DevGrid:fetchVulnerabilities] Fetching vulnerabilities for componentId=${
        componentId ?? "(none)"
      } repositoryId=${repositoryId ?? "(none)"}`
    );

    const allVulnerabilities: DevGridVulnerability[] = [];
    const seenIds = new Set<string>();

    // Fetch vulnerabilities for componentId if available
    if (componentId) {
      this.logTrace(
        `[DevGrid:fetchVulnerabilities] Searching by componentId=${componentId}`
      );
      const componentVulns = await this.fetchVulnerabilitiesByVulnerableId(
        componentId
      );
      for (const vuln of componentVulns) {
        if (!seenIds.has(vuln.id)) {
          seenIds.add(vuln.id);
          allVulnerabilities.push(vuln);
        }
      }
    }

    // Fetch vulnerabilities for repositoryId if available
    if (repositoryId) {
      this.logTrace(
        `[DevGrid:fetchVulnerabilities] Searching by repositoryId=${repositoryId}`
      );
      const repoVulns = await this.fetchVulnerabilitiesByVulnerableId(
        repositoryId
      );
      for (const vuln of repoVulns) {
        if (!seenIds.has(vuln.id)) {
          seenIds.add(vuln.id);
          allVulnerabilities.push(vuln);
        }
      }
    }

    this.logTrace(
      `[DevGrid:fetchVulnerabilities] Found ${
        allVulnerabilities.length
      } unique vulnerabilities (componentId=${
        componentId ? "✓" : "✗"
      } repositoryId=${repositoryId ? "✓" : "✗"})`
    );

    return allVulnerabilities.slice(0, this.maxItems);
  }

  private async fetchVulnerabilitiesByVulnerableId(
    vulnerableId: string
  ): Promise<DevGridVulnerability[]> {
    const data = await this.executeGraphQL<EntityVulnerabilitiesResponse>(
      `
        query VulnerabilitiesByVulnerableId($filter: VulnerabilityFilter, $limit: Int!) {
          vulnerabilities(
            filter: $filter
            pagination: { limit: $limit }
          ) {
            items {
              id
              name
              description
              severity
              status
              openDate
              closeDate
              originatingSystem
              originatingSystemUrl
            }
          }
        }
      `,
      {
        filter: {
          vulnerableId: vulnerableId,
        },
        limit: this.maxItems,
      }
    );

    const items = data?.vulnerabilities?.items ?? [];
    return items
      .map((item) =>
        item
          ? mapVulnerability({
              ...item,
              url: item.originatingSystemUrl,
              reference: item.originatingSystemUrl,
            })
          : undefined
      )
      .filter((entry): entry is DevGridVulnerability => Boolean(entry));
  }

  private async fetchIncidents(entityId: string): Promise<DevGridIncident[]> {
    const data = await this.executeGraphQL<EntityIncidentsResponse>(
      `
        query ComponentIncidents($entityId: ID!, $limit: Int!) {
          incidents(
            filter: { affectedApplicationIds: [$entityId] }
            pagination: { limit: $limit }
          ) {
            items {
              id
              title
              state
              severity
              description
              reportedAt
              resolvedAt
            }
          }
        }
      `,
      { entityId, limit: this.maxItems }
    );

    const items = data?.incidents?.items ?? [];
    return items
      .map((item) => {
        if (!item?.id || !item.title || !item.state) {
          return undefined;
        }
        const incident: DevGridIncident = {
          id: item.id,
          title: item.title,
          state: item.state,
          openedAt: asString(item.reportedAt),
          closedAt: asString(item.resolvedAt),
          summary: asString(item.description),
        };
        return incident;
      })
      .filter((entry): entry is DevGridIncident => Boolean(entry));
  }

  private toEntitySummary(ref: GraphEntityRef): DevGridEntitySummary {
    return {
      id: ref.id,
      slug: ref.shortId ?? undefined,
      name: ref.name ?? ref.shortId ?? ref.id ?? "Entity",
      url: undefined,
      description: ref.description ?? undefined,
    };
  }

  private executeGraphQL<TData>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<TData> {
    if (!this.graphqlEndpoint) {
      return Promise.reject(new Error("GraphQL endpoint is not configured."));
    }

    const url = new URL(this.graphqlEndpoint);
    const isHttps = url.protocol === "https:";
    const transport: HttpModule = isHttps ? https : http;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const payload = JSON.stringify({ query, variables });
    const sanitizedUrl = sanitizeUrl(url);
    this.logTrace(
      `[DevGrid:graphql] POST ${sanitizedUrl} headers=${JSON.stringify(
        sanitizeHeadersForLog(headers)
      )}`
    );

    return new Promise<TData>((resolve, reject) => {
      const req = transport.request(
        {
          method: "POST",
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");

            if ((res.statusCode ?? 0) >= 400) {
              return reject(
                new Error(
                  `DevGrid GraphQL request failed (${res.statusCode}): ${raw}`
                )
              );
            }

            try {
              const parsed = JSON.parse(raw);
              if (
                parsed.errors &&
                Array.isArray(parsed.errors) &&
                parsed.errors.length > 0
              ) {
                const messages = parsed.errors
                  .map((err: any) => err?.message ?? JSON.stringify(err))
                  .join(", ");
                reject(new Error(`DevGrid GraphQL error: ${messages}`));
                return;
              }

              resolve(parsed.data as TData);
            } catch (error) {
              reject(
                new Error(
                  `Unable to parse GraphQL response: ${
                    (error as Error).message
                  }`
                )
              );
            }
          });
        }
      );

      req.on("error", (error) => reject(error));
      req.write(payload);
      req.end();
    });
  }

  private resolveGraphQLEndpoint(): string | undefined {
    const template = this.endpoints.graphql;
    if (!template) {
      return undefined;
    }

    if (/^https?:\/\//i.test(template)) {
      return template;
    }

    return `${this.apiBaseUrl}${
      template.startsWith("/") ? "" : "/"
    }${template}`;
  }

  private logError(scope: string, error: unknown): void {
    if (!this.outputChannel) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`[DevGrid:${scope}] ${message}`);
  }

  private logTrace(message: string): void {
    if (!this.outputChannel) {
      return;
    }
    this.outputChannel.appendLine(`[DevGrid] ${message}`);
  }
}

function mapVulnerability(input: any): DevGridVulnerability | undefined {
  const id = extract(input, ["id", "uuid", "identifier"]);
  const title = extract(input, ["title", "name", "summary"]);
  const severity = (
    extract(input, ["severity", "level"]) ?? "unknown"
  ).toLowerCase();

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    severity,
    status: extract(input, ["status", "state"]),
    packageName: extract(input, ["package", "packageName", "dependency"]),
    versionRange: extract(input, ["affectedRange", "range", "version"]),
    publishedAt: extract(input, ["publishedAt", "published_at", "createdAt"]),
    referenceUrl: extract(input, ["url", "html_url", "reference"]),
  };
}

function extract(value: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function sanitizeHeadersForLog(
  headers: Record<string, string>
): Record<string, string> {
  const copy: Record<string, string> = { ...headers };
  const auth = copy["Authorization"];
  if (auth?.startsWith("Bearer ")) {
    const suffix = auth.slice(-6);
    const masked = `Bearer ***${suffix}`;
    copy["Authorization"] = masked;
  }
  return copy;
}

function sanitizeUrl(url: URL): string {
  const clone = new URL(url.toString());
  clone.username = "";
  clone.password = "";
  return clone.toString();
}

interface GraphEntityDetails {
  entity: GraphEntityRef;
  attributes: Map<string, unknown>;
  relationships: GraphRelationship[];
}

interface GraphEntityRef {
  id?: string;
  shortId?: string;
  name?: string;
  description?: string;
  type?: string;
}

interface GraphRelationship {
  type?: string;
  to?: GraphEntityRef;
}

interface GraphEntity {
  id?: string | null;
  shortId?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  attributes?: Array<GraphAttribute | null> | null;
  relationships?: Array<GraphRelationshipRaw | null> | null;
}

interface GraphAttribute {
  field?: string | null;
  value?: unknown;
}

interface GraphRelationshipRaw {
  type?: string | null;
  to?: GraphEntityRefRaw | null;
}

interface GraphEntityRefRaw {
  id?: string | null;
  shortId?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
}

interface EntityByShortIdResponse {
  allEntities?: Array<GraphEntity | null> | null;
}

interface EntityByIdResponse {
  entity?: GraphEntity | null;
}

interface EntityVulnerabilitiesResponse {
  vulnerabilities?: {
    items?: Array<GraphVulnerability | null> | null;
  } | null;
}

interface GraphVulnerability {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  severity?: string | null;
  status?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  originatingSystem?: string | null;
  originatingSystemUrl?: string | null;
}

interface EntityIncidentsResponse {
  incidents?: {
    items?: Array<GraphIncident | null> | null;
  } | null;
}

interface EntitySearchResponse {
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

interface GraphIncident {
  id?: string | null;
  title?: string | null;
  state?: string | null;
  severity?: string | null;
  description?: string | null;
  reportedAt?: string | null;
  resolvedAt?: string | null;
}

function asString(value: string | null | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function createAttributeMap(entity: GraphEntity): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const attribute of entity.attributes ?? []) {
    if (attribute?.field) {
      map.set(attribute.field, attribute.value);
    }
  }
  return map;
}

function entityMatchesShortId(
  entity: GraphEntity | null | undefined,
  targetShortId: string,
  expectedType?: string
): boolean {
  if (!entity) {
    return false;
  }

  const normalizedTarget = targetShortId.trim().toLowerCase();
  if (!normalizedTarget) {
    return false;
  }

  const entityType = asString(entity.type)?.toLowerCase();
  if (expectedType && entityType !== expectedType.toLowerCase()) {
    return false;
  }

  const direct = asString(entity.shortId)?.toLowerCase();
  if (direct === normalizedTarget) {
    return true;
  }

  const attributeMap = createAttributeMap(entity);
  const attributeShortId = attributeValueToString(
    attributeMap.get("shortId")
  )?.toLowerCase();
  if (attributeShortId === normalizedTarget) {
    return true;
  }

  const attributeAlt = attributeValueToString(
    attributeMap.get("short_id")
  )?.toLowerCase();
  if (attributeAlt === normalizedTarget) {
    return true;
  }

  return false;
}

function attributeValueToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}
