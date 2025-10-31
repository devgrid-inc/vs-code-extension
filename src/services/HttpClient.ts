import type { IHttpClient, HttpRequestOptions, HttpResponse } from '../interfaces/IHttpClient';
import type { ILogger } from '../interfaces/ILogger';

/**
 * HTTP client service implementation with retry logic
 */
export class HttpClient implements IHttpClient {
  private baseUrl = '';
  private defaultHeaders: Record<string, string> = {};
  private authToken = '';

  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(private logger: ILogger) {}

  /**
   * Makes an HTTP request with retry logic
   */
  async request<T = unknown>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const fullUrl = this.buildUrl(url);
    const requestOptions = this.buildRequestOptions(options);
    const maxRetries = requestOptions.retries ?? 3;
    const retryDelay = requestOptions.retryDelay ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Making HTTP ${requestOptions.method ?? 'GET'} request to ${fullUrl}`, {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        const response = await this.makeRequest<T>(fullUrl, requestOptions);
        
        this.logger.debug(`HTTP request successful`, {
          status: response.status,
          attempt: attempt + 1,
        });

        return response;
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn(`HTTP request failed (attempt ${attempt + 1}/${maxRetries + 1})`, {
          error: lastError.message,
          url: fullUrl,
        });

        if (attempt === maxRetries) {
          break;
        }

        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    this.logger.error(`HTTP request failed after ${maxRetries + 1} attempts`, lastError, {
      url: fullUrl,
      method: requestOptions.method ?? 'GET',
    });

    throw lastError;
  }

  /**
   * Makes a GET request
   */
  async get<T = unknown>(url: string, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * Makes a POST request
   */
  async post<T = unknown>(
    url: string,
    body?: string | Buffer,
    options: Omit<HttpRequestOptions, 'method'> = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'POST', body });
  }

  /**
   * Sets the base URL for all requests
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Sets the default headers for all requests
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...headers };
  }

  /**
   * Sets the authorization header
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Builds the full URL
   */
  private buildUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${this.baseUrl}/${url.replace(/^\//, '')}`;
  }

  /**
   * Builds the request options
   */
  private buildRequestOptions(options: HttpRequestOptions): HttpRequestOptions & { headers: Record<string, string> } {
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return {
      method: 'GET',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      ...options,
      headers,
    };
  }

  /**
   * Makes the actual HTTP request
   */
  private async makeRequest<T = unknown>(url: string, options: HttpRequestOptions & { headers: Record<string, string> }): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let data: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        data = await response.json() as T;
      } else {
        data = await response.text() as T;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
