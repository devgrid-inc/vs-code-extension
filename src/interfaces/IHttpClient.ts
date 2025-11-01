/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

/**
 * Interface for HTTP client operations
 */
export interface IHttpClient {
  /**
   * Makes an HTTP request
   * @param url - The URL to request
   * @param options - Request options
   * @returns Promise resolving to the HTTP response
   */
  request<T = unknown>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * Makes a GET request
   * @param url - The URL to request
   * @param options - Request options
   * @returns Promise resolving to the HTTP response
   */
  get<T = unknown>(
    url: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a POST request
   * @param url - The URL to request
   * @param body - Request body
   * @param options - Request options
   * @returns Promise resolving to the HTTP response
   */
  post<T = unknown>(
    url: string,
    body?: string | Buffer,
    options?: Omit<HttpRequestOptions, 'method'>
  ): Promise<HttpResponse<T>>;

  /**
   * Sets the base URL for all requests
   * @param baseUrl - The base URL
   */
  setBaseUrl(baseUrl: string): void;

  /**
   * Sets the default headers for all requests
   * @param headers - The default headers
   */
  setDefaultHeaders(headers: Record<string, string>): void;

  /**
   * Sets the authorization header
   * @param token - The authorization token
   */
  setAuthToken(token: string): void;
}
