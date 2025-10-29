/**
 * GraphQL query options
 */
export interface GraphQLQueryOptions {
  variables?: Record<string, unknown>;
  operationName?: string;
  timeout?: number;
}

/**
 * GraphQL response
 */
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
  extensions?: Record<string, unknown>;
}

/**
 * Interface for GraphQL client operations
 */
export interface IGraphQLClient {
  /**
   * Executes a GraphQL query
   * @param query - The GraphQL query string
   * @param variables - Query variables
   * @param options - Query options
   * @returns Promise resolving to the GraphQL response
   */
  query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: GraphQLQueryOptions
  ): Promise<GraphQLResponse<T>>;

  /**
   * Executes a GraphQL mutation
   * @param mutation - The GraphQL mutation string
   * @param variables - Mutation variables
   * @param options - Mutation options
   * @returns Promise resolving to the GraphQL response
   */
  mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>,
    options?: GraphQLQueryOptions
  ): Promise<GraphQLResponse<T>>;

  /**
   * Sets the GraphQL endpoint URL
   * @param endpoint - The GraphQL endpoint URL
   */
  setEndpoint(endpoint: string): void;

  /**
   * Sets the authorization header
   * @param token - The authorization token
   */
  setAuthToken(token: string): void;
}
