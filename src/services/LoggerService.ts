import { LogLevel, type ILogger } from '../interfaces/ILogger';

/**
 * Structured logger service implementation
 */
export class LoggerService implements ILogger {
  private level: LogLevel = LogLevel.INFO;
  private context: Record<string, unknown> = {};

  constructor(
    private outputChannel: { appendLine: (message: string) => void },
    initialContext: Record<string, unknown> = {}
  ) {
    this.context = { ...initialContext };
  }

  /**
   * Logs a trace message
   */
  trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Logs a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const errorData = error ? { error: error.message, stack: error.stack } : {};
    this.log(LogLevel.ERROR, message, { ...errorData, ...data });
  }

  /**
   * Sets the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Gets the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Creates a child logger with additional context
   */
  child(context: Record<string, unknown>): ILogger {
    return new LoggerService(this.outputChannel, { ...this.context, ...context });
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (level < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const contextStr = Object.keys(this.context).length > 0 ? ` ${JSON.stringify(this.context)}` : '';
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';

    const logMessage = `[${timestamp}] [${levelName}]${contextStr} ${message}${dataStr}`;
    this.outputChannel.appendLine(logMessage);
  }
}
