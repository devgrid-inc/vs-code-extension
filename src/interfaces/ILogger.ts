/**
 * Log levels for structured logging
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

/**
 * Interface for structured logging operations
 */
export interface ILogger {
  /**
   * Logs a trace message
   * @param message - The message to log
   * @param data - Optional additional data to log
   */
  trace(message: string, data?: Record<string, unknown>): void;

  /**
   * Logs a debug message
   * @param message - The message to log
   * @param data - Optional additional data to log
   */
  debug(message: string, data?: Record<string, unknown>): void;

  /**
   * Logs an info message
   * @param message - The message to log
   * @param data - Optional additional data to log
   */
  info(message: string, data?: Record<string, unknown>): void;

  /**
   * Logs a warning message
   * @param message - The message to log
   * @param data - Optional additional data to log
   */
  warn(message: string, data?: Record<string, unknown>): void;

  /**
   * Logs an error message
   * @param message - The message to log
   * @param error - Optional error object to log
   * @param data - Optional additional data to log
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void;

  /**
   * Sets the minimum log level
   * @param level - The minimum log level to display
   */
  setLevel(level: LogLevel): void;

  /**
   * Gets the current log level
   * @returns The current log level
   */
  getLevel(): LogLevel;

  /**
   * Creates a child logger with additional context
   * @param context - Additional context to include in all log messages
   * @returns A new logger instance with the additional context
   */
  child(context: Record<string, unknown>): ILogger;
}
