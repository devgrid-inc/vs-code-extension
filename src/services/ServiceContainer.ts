import type { IDevGridClient } from '../interfaces/IDevGridClient';
import type { IConfigLoader } from '../interfaces/IConfigLoader';
import type { IGitService } from '../interfaces/IGitService';
import type { ILogger } from '../interfaces/ILogger';
import type { IHttpClient } from '../interfaces/IHttpClient';
import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import { DevGridClientService } from './DevGridClientService';
import { EntityResolver } from './EntityResolver';
import { VulnerabilityService } from './VulnerabilityService';
import { IncidentService } from './IncidentService';
import { DependencyService } from './DependencyService';
import { HttpClient } from './HttpClient';
import { GraphQLClient } from './GraphQLClient';
import { LoggerService } from './LoggerService';
import { GitService } from './GitService';
import { ConfigService } from './ConfigService';
import type { DevGridClientOptions } from '../types';

/**
 * Service container for dependency injection
 */
export class ServiceContainer {
  private services = new Map<string, any>();

  constructor(private outputChannel: { appendLine: (message: string) => void }) {}

  /**
   * Gets or creates a service instance
   */
  get<T>(key: string, factory?: () => T): T {
    if (!this.services.has(key)) {
      if (!factory) {
        throw new Error(`Service ${key} not found and no factory provided`);
      }
      this.services.set(key, factory());
    }
    return this.services.get(key);
  }

  /**
   * Registers a service instance
   */
  register<T>(key: string, instance: T): void {
    this.services.set(key, instance);
  }

  /**
   * Creates the main DevGrid client
   */
  createDevGridClient(options: DevGridClientOptions): IDevGridClient {
    const logger = this.getLogger();
    const httpClient = this.getHttpClient();
    const graphqlClient = this.getGraphQLClient(options.apiBaseUrl, httpClient, logger);
    const gitService = this.getGitService();
    const entityResolver = this.getEntityResolver(graphqlClient, gitService, logger);
    const vulnerabilityService = this.getVulnerabilityService(graphqlClient, logger, options.maxItems);
    const incidentService = this.getIncidentService(graphqlClient, logger, options.maxItems);
    const dependencyService = this.getDependencyService(graphqlClient, logger, options.maxItems);

    const client = new DevGridClientService(
      entityResolver,
      vulnerabilityService,
      incidentService,
      dependencyService,
      logger,
      (options.endpoints || {}) as Record<string, string | undefined>
    );

    // Set dashboard URL if available
    if (options.endpoints?.dashboardUrl) {
      client.setDashboardUrl(options.endpoints.dashboardUrl);
    }

    return client;
  }

  /**
   * Gets the logger service
   */
  private getLogger(): ILogger {
    return this.get('logger', () => new LoggerService(this.outputChannel));
  }

  /**
   * Gets the HTTP client
   */
  private getHttpClient(): IHttpClient {
    return this.get('httpClient', () => {
      const logger = this.getLogger();
      const client = new HttpClient(logger);
      return client;
    });
  }

  /**
   * Gets the GraphQL client
   */
  private getGraphQLClient(
    apiBaseUrl: string,
    httpClient: IHttpClient,
    logger: ILogger
  ): IGraphQLClient {
    const key = `graphqlClient:${apiBaseUrl}`;
    return this.get(key, () => {
      const client = new GraphQLClient(httpClient, logger);
      client.setEndpoint(`${apiBaseUrl}/graphql`);
      return client;
    });
  }

  /**
   * Gets the Git service
   */
  private getGitService(): IGitService {
    return this.get('gitService', () => {
      const logger = this.getLogger();
      return new GitService(logger);
    });
  }

  /**
   * Gets the entity resolver
   */
  private getEntityResolver(
    graphqlClient: IGraphQLClient,
    gitService: IGitService,
    logger: ILogger
  ): EntityResolver {
    return this.get('entityResolver', () => new EntityResolver(graphqlClient, gitService, logger));
  }

  /**
   * Gets the vulnerability service
   */
  private getVulnerabilityService(
    graphqlClient: IGraphQLClient,
    logger: ILogger,
    maxItems: number
  ): VulnerabilityService {
    return this.get(`vulnerabilityService:${maxItems}`, () => 
      new VulnerabilityService(graphqlClient, logger, maxItems)
    );
  }

  /**
   * Gets the incident service
   */
  private getIncidentService(
    graphqlClient: IGraphQLClient,
    logger: ILogger,
    maxItems: number
  ): IncidentService {
    return this.get(`incidentService:${maxItems}`, () => 
      new IncidentService(graphqlClient, logger, maxItems)
    );
  }

  /**
   * Gets the dependency service
   */
  private getDependencyService(
    graphqlClient: IGraphQLClient,
    logger: ILogger,
    maxItems: number
  ): DependencyService {
    return this.get(`dependencyService:${maxItems}`, () => 
      new DependencyService(graphqlClient, logger, maxItems)
    );
  }

  /**
   * Gets the config loader
   */
  getConfigLoader(): IConfigLoader {
    return this.get('configLoader', () => {
      const logger = this.getLogger();
      return new ConfigService(logger);
    });
  }

  /**
   * Clears all services (useful for testing)
   */
  clear(): void {
    this.services.clear();
  }
}
