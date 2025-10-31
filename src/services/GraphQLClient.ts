import type {
  IGraphQLClient,
  GraphQLResponse,
  GraphQLQueryOptions,
} from '../interfaces/IGraphQLClient';
import type { IHttpClient } from '../interfaces/IHttpClient';
import type { ILogger } from '../interfaces/ILogger';

/**
 * GraphQL client service implementation
 */
export class GraphQLClient implements IGraphQLClient {
  private endpoint = '';

  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(
    private httpClient: IHttpClient,
    private logger: ILogger
  ) {}

  /**
   * Executes a GraphQL query
   */
  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: GraphQLQueryOptions
  ): Promise<GraphQLResponse<T>> {
    return this.executeRequest<T>(query, variables, options);
  }

  /**
   * Executes a GraphQL mutation
   */
  async mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>,
    options?: GraphQLQueryOptions
  ): Promise<GraphQLResponse<T>> {
    return this.executeRequest<T>(mutation, variables, options);
  }

  /**
   * Sets the GraphQL endpoint URL
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Sets the authorization header
   */
  setAuthToken(token: string): void {
    this.httpClient.setAuthToken(token);
  }

  /**
   * Executes a GraphQL request
   */
  private async executeRequest<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: GraphQLQueryOptions
  ): Promise<GraphQLResponse<T>> {
    if (!this.endpoint) {
      throw new Error('GraphQL endpoint not set');
    }

    const requestBody = {
      query,
      variables: variables ?? {},
      operationName: options?.operationName,
    };

    // Log full query and variables in debug mode
    this.logger.debug('Executing GraphQL request', {
      operationName: options?.operationName,
      query: query.trim(),
      variables: variables ?? {},
      endpoint: this.endpoint,
    });

    try {
      const response = await this.httpClient.post<GraphQLResponse<T>>(
        this.endpoint,
        JSON.stringify(requestBody),
        {
          timeout: options?.timeout ?? 30000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // Log full response in debug mode
      this.logger.debug('GraphQL response received', {
        operationName: options?.operationName,
        hasData: !!response.data.data,
        hasErrors: !!(response.data.errors && response.data.errors.length > 0),
        response: response.data,
      });

      if (response.data.errors && response.data.errors.length > 0) {
        this.logger.warn('GraphQL request returned errors', {
          errors: response.data.errors,
          operationName: options?.operationName,
        });
      }

      return response.data;
    } catch (error) {
      this.logger.error('GraphQL request failed', error as Error, {
        operationName: options?.operationName,
        endpoint: this.endpoint,
      });
      throw error;
    }
  }
}
