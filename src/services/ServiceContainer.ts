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
import { validateApiUrl } from '../utils/validation';
import type { DevGridClientOptions } from '../types';

/**
 * Service container for dependency injection
 */
export class ServiceContainer {
  private services = new Map<string, any>();
  private apiBaseUrl: string = 'https://prod.api.devgrid.io'; // Default fallback
  private authToken: string | undefined;

  constructor(private outputChannel: { appendLine: (message: string) => void }) {}

  /**
   * Sets the API base URL for services
   */
  setApiBaseUrl(url: string): void {
    const validatedUrl = validateApiUrl(url);
    this.apiBaseUrl = validatedUrl;
    const httpClient = this.services.get('httpClient') as IHttpClient | undefined;
    if (httpClient) {
      httpClient.setBaseUrl(validatedUrl);
    }

    for (const key of Array.from(this.services.keys())) {
      if (
        key.startsWith('graphqlClient:') ||
        key.startsWith('vulnerabilityService:') ||
        key.startsWith('incidentService:') ||
        key.startsWith('dependencyService:') ||
        key === 'entityResolver'
      ) {
        this.services.delete(key);
      }
    }
  }

  /**
   * Sets the authorization token for outgoing requests
   */
  setAuthToken(token?: string): void {
    this.authToken = token;

    const httpClient = this.services.get('httpClient') as IHttpClient | undefined;
    if (httpClient) {
      httpClient.setAuthToken(token ?? '');
    }

    for (const [key, service] of this.services.entries()) {
      if (key.startsWith('graphqlClient:')) {
        (service as IGraphQLClient).setAuthToken(token ?? '');
      }
    }
  }

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
    const vulnerabilityService = this.getVulnerabilityServiceForClient(graphqlClient, logger, options.maxItems);
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
      client.setBaseUrl(this.apiBaseUrl);
      if (this.authToken) {
        client.setAuthToken(this.authToken);
      }
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
    const client = this.get(key, () => {
      const client = new GraphQLClient(httpClient, logger);
      client.setEndpoint(`${apiBaseUrl}/graphql`);
      client.setAuthToken(this.authToken ?? '');
      return client;
    });
    if (this.authToken !== undefined) {
      client.setAuthToken(this.authToken ?? '');
    }
    return client;
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
   * Gets the vulnerability service (private method for client creation)
   */
  private getVulnerabilityServiceForClient(
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
   * Gets the vulnerability service
   */
  getVulnerabilityService(): VulnerabilityService {
    const logger = this.getLogger();
    const httpClient = this.getHttpClient();
    // Use the configured API URL
    const graphqlClient = this.getGraphQLClient(this.apiBaseUrl, httpClient, logger);
    return this.get('vulnerabilityService:100', () =>
      new VulnerabilityService(graphqlClient, logger, 100)
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
    this.authToken = undefined;
  }
}
