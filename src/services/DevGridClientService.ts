import type { IDevGridClient } from '../interfaces/IDevGridClient';
import type { ILogger } from '../interfaces/ILogger';
import type { DevGridIdentifiers, DevGridInsightBundle, DevGridEntitySummary } from '../types';
import { renderTemplate } from '../utils/templateUtils';

import type { DependencyService } from './DependencyService';
import type { EntityResolver, GraphEntityDetails } from './EntityResolver';
import type { IncidentService } from './IncidentService';
import type { VulnerabilityService } from './VulnerabilityService';

/**
 * DevGrid client service that orchestrates all DevGrid operations
 */
export class DevGridClientService implements IDevGridClient {
  private statusText = 'DevGrid: Ready';
  private dashboardUrl?: string;

  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(
    private entityResolver: EntityResolver,
    private vulnerabilityService: VulnerabilityService,
    private incidentService: IncidentService,
    private dependencyService: DependencyService,
    private logger: ILogger,
    private endpoints: Record<string, string | undefined>
  ) {}

  /**
   * Fetches comprehensive insights for the given identifiers
   */
  async fetchInsights(identifiers: DevGridIdentifiers, workspacePath?: string): Promise<DevGridInsightBundle> {
    this.logger.info('Starting insights fetch', { identifiers });

    try {
      const context = { ...identifiers };
      const bundle: DevGridInsightBundle = {
        vulnerabilities: [],
        incidents: [],
        dependencies: [],
      };

      // Load component details
      const componentDetails = await this.entityResolver.loadComponentDetails(context);
      if (componentDetails) {
        bundle.component = this.entityResolver.toEntitySummary(componentDetails);
      }

      // Load repository details
      const repositoryDetails = await this.entityResolver.loadRepositoryDetails(context, componentDetails, workspacePath);
      if (repositoryDetails) {
        bundle.repository = this.entityResolver.toRepositorySummary(repositoryDetails);
      } else {
        const repository = this.buildRepositorySummary(componentDetails);
        if (repository) {
          bundle.repository = repository;
        }
      }

      // Check repo-component linkage
      if (bundle.component?.id && repositoryDetails) {
        const linkageResult = this.entityResolver.checkRepoComponentLinkage(
          bundle.component.id,
          repositoryDetails
        );
        bundle.linkageStatus = {
          repoComponentLinked: linkageResult.linked,
          message: linkageResult.message,
        };
        this.logger.debug('Linkage check completed', {
          componentId: bundle.component.id,
          repositoryId: bundle.repository?.id,
          linked: linkageResult.linked,
        });
      }

      // Load application details
      const applicationDetails = await this.entityResolver.loadApplicationDetails(context, componentDetails);
      if (applicationDetails) {
        bundle.application = this.entityResolver.toApplicationSummary(applicationDetails);
      } else {
        const applicationFallback = this.buildApplicationSummary(componentDetails, context);
        if (applicationFallback) {
          bundle.application = applicationFallback;
        }
      }

      // Fetch vulnerabilities
      if (context.componentId || context.repositoryId) {
        bundle.vulnerabilities = await this.vulnerabilityService.fetchVulnerabilities(
          context.componentId,
          context.repositoryId
        );
      }

      // Fetch incidents
      const incidentEntityId = context.componentId || context.repositoryId;
      if (incidentEntityId) {
        bundle.incidents = (await this.incidentService.fetchIncidents(incidentEntityId)).slice(0, 20);
      }

      // Fetch dependencies
      if (context.componentId) {
        bundle.dependencies = await this.dependencyService.fetchDependencies(context.componentId);
      }

      this.logger.info('Insights fetch completed', {
        repository: bundle.repository?.slug ?? '-',
        component: bundle.component?.slug ?? '-',
        application: bundle.application?.slug ?? '-',
        vulnerabilities: bundle.vulnerabilities.length,
        incidents: bundle.incidents.length,
        dependencies: bundle.dependencies.length,
      });

      this.statusText = 'DevGrid: Ready';
      return bundle;
    } catch (error) {
      this.logger.error('Failed to fetch insights', error as Error, { identifiers });
      this.statusText = `DevGrid: Error - ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    }
  }

  /**
   * Gets the current status text for display in the status bar
   */
  getStatusText(): string {
    return this.statusText;
  }

  /**
   * Gets the dashboard URL for the current context
   */
  getDashboardUrl(): string | undefined {
    return this.dashboardUrl;
  }

  /**
   * Sets the dashboard URL
   */
  setDashboardUrl(url: string | undefined): void {
    this.dashboardUrl = url;
  }

  clearCaches(): void {
    this.vulnerabilityService.clearCache();
    this.incidentService.clearCache();
    this.dependencyService.clearCache();
  }

  /**
   * Builds repository summary from component details
   */
  private buildRepositorySummary(
    componentDetails: GraphEntityDetails | undefined
  ): DevGridEntitySummary | undefined {
    if (!componentDetails) {
      return undefined;
    }

    let summary: DevGridEntitySummary | undefined;

    // Look for repository relationship
    for (const relationship of componentDetails.relationships) {
      if (!relationship) {
        continue;
      }

      const target = relationship.to;
      if (!target) {
        continue;
      }

      const targetType = target.type?.toLowerCase();
      if (targetType !== 'repo') {
        continue;
      }

      summary = this.entityResolver.toEntitySummary({
        entity: target,
        attributes: new Map(),
        relationships: [],
      });
      break;
    }

    if (summary) {
      // Enhance with additional information
      const repositoryUrl =
        this.getAttributeValue(componentDetails, 'repositoryUrl') ??
        this.getAttributeValue(componentDetails, 'url');

      if (repositoryUrl && !summary.url) {
        summary.url = repositoryUrl;
      }

      if (summary.url && !summary.slug) {
        // Derive slug from URL if not available
        const url = new URL(summary.url);
        const pathParts = url.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length >= 2) {
          summary.slug = `${pathParts[0]}/${pathParts[1]}`;
        }
      }
    }

    return summary;
  }

  /**
   * Builds application summary from component details
   */
  private buildApplicationSummary(
    componentDetails: GraphEntityDetails | undefined,
    context: DevGridIdentifiers
  ): DevGridEntitySummary | undefined {
    if (!componentDetails) {
      return undefined;
    }

    let summary: DevGridEntitySummary | undefined;

    // Look for application relationship
    for (const relationship of componentDetails.relationships) {
      if (!relationship) {
        continue;
      }

      const target = relationship.to;
      if (!target) {
        continue;
      }

      const targetType = target.type?.toLowerCase();
      if (targetType !== 'application') {
        continue;
      }

      summary = this.entityResolver.toEntitySummary({
        entity: target,
        attributes: new Map(),
        relationships: [],
      });
      break;
    }

    if (summary) {
      // Enhance with additional information
      const applicationSlug = this.getAttributeValue(componentDetails, 'applicationSlug');

      if (!summary.slug && applicationSlug) {
        summary.slug = applicationSlug;
      }

      if (!summary.slug && context.applicationSlug) {
        summary.slug = context.applicationSlug;
      }
    }

    return summary;
  }

  /**
   * Gets attribute value from component details
   */
  private getAttributeValue(componentDetails: GraphEntityDetails, key: string): string | undefined {
    const value = componentDetails.attributes.get(key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    return undefined;
  }

  /**
   * Renders dashboard URL from template
   */
  renderDashboardUrl(context: Record<string, string | undefined>): string | undefined {
    const template = this.endpoints.dashboardUrl;
    if (!template) {
      return undefined;
    }

    return renderTemplate(template, context);
  }
}
