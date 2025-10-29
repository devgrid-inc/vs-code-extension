/**
 * Error handling and formatting utilities
 */

/**
 * Error types for different categories of errors
 */
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  CONFIGURATION = 'CONFIGURATION',
  API = 'API',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base error class for DevGrid extension errors
 */
export class DevGridError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    options: {
      code?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'DevGridError';
    this.type = type;
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;

    if (options.cause) {
      (this as any).cause = options.cause;
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DevGridError);
    }
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends DevGridError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.AUTHENTICATION, {
      code: 'AUTH_ERROR',
      details,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Network error class
 */
export class NetworkError extends DevGridError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.NETWORK, {
      code: 'NETWORK_ERROR',
      details,
      retryable: true,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Configuration error class
 */
export class ConfigurationError extends DevGridError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.CONFIGURATION, {
      code: 'CONFIG_ERROR',
      details,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * API error class
 */
export class ApiError extends DevGridError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.API, {
      code: 'API_ERROR',
      details,
      retryable: true,
    });
    this.name = 'ApiError';
  }
}

/**
 * Validation error class
 */
export class ValidationError extends DevGridError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.VALIDATION, {
      code: 'VALIDATION_ERROR',
      details,
      retryable: false,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Determines if an error is retryable
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DevGridError) {
    return error.retryable;
  }

  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    );
  }

  return false;
}

/**
 * Formats an error for user display
 * @param error - The error to format
 * @returns User-friendly error message
 */
export function formatErrorForUser(error: unknown): string {
  if (error instanceof DevGridError) {
    switch (error.type) {
      case ErrorType.AUTHENTICATION:
        return 'Authentication failed. Please sign in again.';
      case ErrorType.AUTHORIZATION:
        return 'You do not have permission to access this resource.';
      case ErrorType.NETWORK:
        return 'Network error. Please check your connection and try again.';
      case ErrorType.CONFIGURATION:
        return `Configuration error: ${error.message}`;
      case ErrorType.VALIDATION:
        return `Invalid configuration: ${error.message}`;
      case ErrorType.API:
        return `API error: ${error.message}`;
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred.';
}

/**
 * Formats an error for logging
 * @param error - The error to format
 * @returns Detailed error information for logging
 */
export function formatErrorForLogging(error: unknown): Record<string, unknown> {
  if (error instanceof DevGridError) {
    return {
      name: error.name,
      type: error.type,
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
      stack: error.stack,
      cause: (error as any).cause ? formatErrorForLogging((error as any).cause) : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

/**
 * Creates a user-friendly error message with actionable suggestions
 * @param error - The error to create a message for
 * @returns Error message with suggestions
 */
export function createActionableErrorMessage(error: unknown): string {
  if (error instanceof DevGridError) {
    switch (error.type) {
      case ErrorType.AUTHENTICATION:
        return 'Please sign in to DevGrid using the command palette (Ctrl+Shift+P) and search for "DevGrid: Sign In".';
      case ErrorType.AUTHORIZATION:
        return 'Please check your DevGrid permissions or contact your administrator.';
      case ErrorType.NETWORK:
        return 'Please check your internet connection and try again. If the problem persists, check your firewall settings.';
      case ErrorType.CONFIGURATION:
        return 'Please check your devgrid.yaml configuration file and ensure all required fields are present.';
      case ErrorType.VALIDATION:
        return 'Please review your configuration and ensure all values are valid.';
      case ErrorType.API:
        return 'There was an issue communicating with the DevGrid API. Please try again later.';
      default:
        return `An error occurred: ${error.message}`;
    }
  }

  return formatErrorForUser(error);
}

/**
 * Wraps an error with additional context
 * @param error - The original error
 * @param context - Additional context to add
 * @returns A new DevGridError with the additional context
 */
export function wrapError(error: unknown, context: Record<string, unknown>): DevGridError {
  if (error instanceof DevGridError) {
    return new DevGridError(error.message, error.type, {
      code: error.code,
      details: { ...error.details, ...context },
      retryable: error.retryable,
      cause: error,
    });
  }

  if (error instanceof Error) {
    return new DevGridError(error.message, ErrorType.UNKNOWN, {
      details: context,
      cause: error,
    });
  }

  return new DevGridError(String(error), ErrorType.UNKNOWN, {
    details: context,
  });
}
