/**
 * Structured logging system for Meta MCP.
 *
 * Outputs to stderr to avoid interfering with MCP stdio protocol.
 * Supports both JSON and text formats for debugging.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface LogContext {
  requestId?: string;
  accountId?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

/**
 * Structured logger that outputs to stderr.
 */
export class Logger {
  private level: LogLevel;
  private jsonFormat: boolean;
  private prefix: string;

  constructor(options?: {
    level?: LogLevel;
    jsonFormat?: boolean;
    prefix?: string;
  }) {
    // Parse log level from environment or options
    const envLevel = process.env.META_MCP_LOG_LEVEL?.toLowerCase();
    this.level =
      options?.level ||
      (envLevel && LOG_LEVELS[envLevel as LogLevel] !== undefined
        ? (envLevel as LogLevel)
        : "info");

    // Parse format from environment or options
    this.jsonFormat =
      options?.jsonFormat ?? process.env.META_MCP_LOG_FORMAT === "json";

    this.prefix = options?.prefix || "meta-mcp";
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      context,
    };

    if (this.jsonFormat) {
      return JSON.stringify(entry);
    }

    // Text format: [timestamp] [level] [prefix] message (context)
    let output = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.prefix}] ${message}`;

    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ");
      if (contextStr) {
        output += ` (${contextStr})`;
      }
    }

    return output;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, context);
    // Output to stderr to avoid interfering with MCP stdio protocol
    console.error(formatted);
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Log with timing - returns a function to call when operation completes.
   */
  time(
    operation: string,
    context?: Omit<LogContext, "operation" | "duration">
  ): () => void {
    const start = Date.now();
    this.debug(`Starting: ${operation}`, { operation, ...context });

    return () => {
      const duration = Date.now() - start;
      this.debug(`Completed: ${operation}`, { operation, duration, ...context });
    };
  }

  /**
   * Create a child logger with additional context.
   */
  child(additionalContext: LogContext): ChildLogger {
    return new ChildLogger(this, additionalContext);
  }

  /**
   * Get current log level.
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set log level at runtime.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * Child logger that inherits context from parent.
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  private mergeContext(additional?: LogContext): LogContext {
    return { ...this.context, ...additional };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, context?: LogContext): void {
    this.parent.error(message, this.mergeContext(context));
  }

  time(
    operation: string,
    context?: Omit<LogContext, "operation" | "duration">
  ): () => void {
    return this.parent.time(operation, this.mergeContext(context));
  }
}

/**
 * Global logger instance.
 */
export const logger = new Logger();

/**
 * Create a request-scoped logger with a request ID.
 */
export function createRequestLogger(requestId: string): ChildLogger {
  return logger.child({ requestId });
}
