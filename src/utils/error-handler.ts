import type { MetaApiError } from "../types/meta-api.js";
import { RateLimitError } from "./rate-limiter.js";
import type {
  ErrorEnvelope,
  SuccessEnvelope,
  ParsedMetaError,
  ErrorCode,
} from "../types/error-envelope.js";
import { ERROR_MESSAGES, META_ERROR_CODE_MAP } from "../types/error-envelope.js";

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

function isTransientNetworkError(error: Error): boolean {
  const errorCode = (error as { code?: string }).code;

  return (
    error.name === "FetchError" ||
    error.name === "AbortError" ||
    (errorCode ? RETRYABLE_NETWORK_ERROR_CODES.has(errorCode) : false)
  );
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) return undefined;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, retryAfterSeconds * 1000);
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (!Number.isNaN(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return undefined;
}

export class MetaApiErrorHandler {
  static isMetaApiError(error: any): error is MetaApiError {
    return error && error.error && typeof error.error.code === "number";
  }

  static async handleResponse(response: any): Promise<any> {
    const responseText = await response.text();
    const retryAfterMs = parseRetryAfterMs(
      response?.headers?.get?.("retry-after") ?? null
    );

    if (!response.ok) {
      let errorData: any;

      try {
        errorData = JSON.parse(responseText);
      } catch {
        if (response.status === 429) {
          throw new RateLimitError(
            `HTTP 429: ${responseText}`,
            retryAfterMs ?? 60000
          );
        }
        throw new MetaApiProcessingError(
          `HTTP ${response.status}: ${responseText}`,
          response.status
        );
      }

      if (this.isMetaApiError(errorData)) {
        throw this.createSpecificError(
          errorData,
          response.status,
          retryAfterMs
        );
      }

      if (response.status === 429) {
        throw new RateLimitError(
          `HTTP 429: ${responseText}`,
          retryAfterMs ?? 60000
        );
      }

      throw new MetaApiProcessingError(
        `HTTP ${response.status}: ${responseText}`,
        response.status
      );
    }

    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  private static createSpecificError(
    errorData: MetaApiError,
    _httpStatus: number,
    retryAfterMs?: number
  ): Error {
    const { error } = errorData;
    const { code, error_subcode, message, type } = error;

    // Rate limiting errors
    if (code === 17 && error_subcode === 2446079) {
      return new RateLimitError(message, retryAfterMs ?? 300000); // 5 minutes
    }
    if (code === 613 && error_subcode === 1487742) {
      return new RateLimitError(message, retryAfterMs ?? 60000); // 1 minute
    }
    if (
      code === 4 &&
      (error_subcode === 1504022 || error_subcode === 1504039)
    ) {
      return new RateLimitError(message, retryAfterMs ?? 300000); // 5 minutes
    }

    // Authentication errors
    if (code === 190) {
      return new MetaAuthError(message, code, error_subcode);
    }

    // Permission errors
    if (code === 200 || code === 10) {
      return new MetaPermissionError(message, code, error_subcode);
    }

    // Validation errors
    if (code === 100) {
      return new MetaValidationError(message, code, error_subcode);
    }

    // Application request limit
    if (code === 4) {
      return new MetaApplicationLimitError(message, code, error_subcode);
    }

    // User request limit
    if (code === 17) {
      return new MetaUserLimitError(message, code, error_subcode);
    }

    // Generic Meta API error
    return new MetaApiProcessingError(
      message,
      undefined,
      code,
      error_subcode,
      type
    );
  }

  static shouldRetry(error: Error): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof MetaApplicationLimitError) return true;
    if (error instanceof MetaUserLimitError) return true;
    if (isTransientNetworkError(error)) return true;
    if (error instanceof MetaApiProcessingError) {
      // Retry on server errors
      if ((error.httpStatus || 0) >= 500) return true;
      return error.httpStatus === 429;
    }
    return false;
  }

  static getRetryDelay(error: Error, attempt: number): number {
    if (error instanceof RateLimitError) {
      return error.retryAfterMs;
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 60000); // Cap at 1 minute
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return baseDelay + jitter;
  }

  static getMaxRetries(error: Error): number {
    if (error instanceof RateLimitError) return 3;
    if (error instanceof MetaApplicationLimitError) return 2;
    if (error instanceof MetaUserLimitError) return 2;
    if (isTransientNetworkError(error)) return 3;
    if (
      error instanceof MetaApiProcessingError &&
      (error.httpStatus || 0) >= 500
    )
      return 3;
    if (error instanceof MetaApiProcessingError && error.httpStatus === 429)
      return 3;
    return 0; // No retry for other errors
  }
}

export class MetaApiProcessingError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly errorCode?: number,
    public readonly errorSubcode?: number,
    public readonly errorType?: string
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      httpStatus: this.httpStatus,
      errorCode: this.errorCode,
      errorSubcode: this.errorSubcode,
      errorType: this.errorType,
    };
  }
}

export class MetaAuthError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 401, errorCode, errorSubcode, "OAuthException");
    this.name = "MetaAuthError";
  }
}

export class MetaPermissionError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 403, errorCode, errorSubcode, "FacebookApiException");
    this.name = "MetaPermissionError";
  }
}

export class MetaValidationError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 400, errorCode, errorSubcode, "FacebookApiException");
    this.name = "MetaValidationError";
  }
}

export class MetaApplicationLimitError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(
      message,
      429,
      errorCode,
      errorSubcode,
      "ApplicationRequestLimitReached"
    );
    this.name = "MetaApplicationLimitError";
  }
}

export class MetaUserLimitError extends MetaApiProcessingError {
  constructor(message: string, errorCode?: number, errorSubcode?: number) {
    super(message, 429, errorCode, errorSubcode, "UserRequestLimitReached");
    this.name = "MetaUserLimitError";
  }
}

export interface RetryOptions {
  context?: string;
  maxRetries?: number;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  contextOrOptions: string | RetryOptions = "operation"
): Promise<T> {
  const options: RetryOptions =
    typeof contextOrOptions === "string"
      ? { context: contextOrOptions }
      : contextOrOptions;

  const context = options.context || "operation";
  let lastError: Error | undefined;
  let attempt = 0;

  while (true) {
    // Check for cancellation
    if (options.signal?.aborted) {
      throw new Error(`${context} was cancelled`);
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!MetaApiErrorHandler.shouldRetry(lastError)) {
        throw lastError;
      }

      const maxRetriesForError =
        options.maxRetries ?? MetaApiErrorHandler.getMaxRetries(lastError);
      attempt++;
      if (attempt > maxRetriesForError) {
        lastError.message = `${context} failed after ${maxRetriesForError} retries: ${lastError.message}`;
        throw lastError;
      }

      const delay = MetaApiErrorHandler.getRetryDelay(lastError, attempt);

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(lastError, attempt, delay);
      } else {
        console.warn(
          `${context} failed (attempt ${attempt}/${maxRetriesForError}), retrying in ${delay}ms: ${lastError.message}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Parse any error into a structured ParsedMetaError.
 */
export function parseMetaApiError(error: unknown): ParsedMetaError | null {
  // Handle MetaApiProcessingError instances
  if (error instanceof MetaApiProcessingError) {
    return {
      code: error.errorCode || 0,
      subcode: error.errorSubcode,
      type: error.errorType || "UnknownError",
      message: error.message,
      isTransient: MetaApiErrorHandler.shouldRetry(error),
      retryAfterMs:
        error instanceof RateLimitError ? error.retryAfterMs : undefined,
    };
  }

  // Handle RateLimitError
  if (error instanceof RateLimitError) {
    return {
      code: 17,
      type: "RateLimitError",
      message: error.message,
      isTransient: true,
      retryAfterMs: error.retryAfterMs,
    };
  }

  // Handle plain objects (e.g., parsed JSON from Meta API)
  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, any>;

    // Handle { error: { ... } } format from Meta API
    if (errorObj.error && typeof errorObj.error === "object") {
      const metaError = errorObj.error;
      return {
        code: metaError.code || 0,
        subcode: metaError.error_subcode,
        type: metaError.type || "UnknownError",
        message: metaError.message || "Unknown error",
        userTitle: metaError.error_user_title,
        userMessage: metaError.error_user_msg,
        fbtraceId: metaError.fbtrace_id,
        isTransient: isTransientMetaError(metaError.code, metaError.error_subcode),
        errorData: metaError.error_data,
      };
    }
  }

  // Handle Error instances with JSON in message
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error) {
        return parseMetaApiError(parsed);
      }
    } catch {
      // Not JSON, return basic error info
    }

    return {
      code: 0,
      type: error.name,
      message: error.message,
      isTransient: isTransientNetworkError(error),
    };
  }

  // Handle string errors
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      return parseMetaApiError(parsed);
    } catch {
      return {
        code: 0,
        type: "UnknownError",
        message: error,
        isTransient: false,
      };
    }
  }

  return null;
}

/**
 * Check if a Meta error code indicates a transient error.
 */
function isTransientMetaError(code?: number, subcode?: number): boolean {
  if (!code) return false;

  // Rate limit errors
  if (code === 17 || code === 4 || code === 613) return true;

  // Temporary service errors
  if (code === 1 || code === 2) return true;

  return false;
}

/**
 * Get a human-readable error message for a Meta error code.
 */
export function getHumanReadableError(parsed: ParsedMetaError): string {
  // Check for specific subcode messages first
  if (parsed.subcode && ERROR_MESSAGES[parsed.subcode]) {
    return ERROR_MESSAGES[parsed.subcode];
  }

  // Check for code-level messages
  if (parsed.code && ERROR_MESSAGES[parsed.code]) {
    return ERROR_MESSAGES[parsed.code];
  }

  // Use user-facing message if available
  if (parsed.userMessage) {
    return parsed.userMessage;
  }

  // Fall back to the original message
  return parsed.message;
}

/**
 * Map an error to a standardized ErrorCode.
 */
export function getErrorCode(error: Error): ErrorCode {
  if (error instanceof MetaAuthError) {
    return "META_AUTH_EXPIRED";
  }

  if (error instanceof MetaPermissionError) {
    return "META_PERMISSION_DENIED";
  }

  if (error instanceof MetaValidationError) {
    return "META_VALIDATION_ERROR";
  }

  if (error instanceof MetaApplicationLimitError) {
    return "META_RATE_LIMIT_APP";
  }

  if (error instanceof MetaUserLimitError || error instanceof RateLimitError) {
    return "META_RATE_LIMIT_USER";
  }

  if (error instanceof MetaApiProcessingError) {
    const code = error.errorCode;
    if (code && META_ERROR_CODE_MAP[code]) {
      return META_ERROR_CODE_MAP[code];
    }

    if ((error.httpStatus || 0) >= 500) {
      return "META_INTERNAL_ERROR";
    }

    if (error.httpStatus === 404) {
      return "META_RESOURCE_NOT_FOUND";
    }
  }

  if (error.name === "AbortError") {
    return "META_TIMEOUT";
  }

  if (isTransientNetworkError(error)) {
    return "META_NETWORK_ERROR";
  }

  return "MCP_INTERNAL_ERROR";
}

/**
 * Convert an error to a structured ErrorEnvelope.
 */
export function toErrorEnvelope(
  error: Error,
  context?: Record<string, unknown>
): ErrorEnvelope {
  const code = getErrorCode(error);
  const parsed = parseMetaApiError(error);
  const isRetryable = MetaApiErrorHandler.shouldRetry(error);

  let retryAfterMs: number | undefined;
  if (error instanceof RateLimitError) {
    retryAfterMs = error.retryAfterMs;
  } else if (parsed?.retryAfterMs) {
    retryAfterMs = parsed.retryAfterMs;
  }

  return {
    success: false,
    error: {
      code,
      message: parsed ? getHumanReadableError(parsed) : error.message,
      retryable: isRetryable,
      retryAfterMs: isRetryable ? retryAfterMs : undefined,
      details:
        error instanceof MetaApiProcessingError
          ? {
              httpStatus: error.httpStatus,
              metaErrorCode: error.errorCode,
              metaErrorSubcode: error.errorSubcode,
              metaErrorType: error.errorType,
              fbtraceId: parsed?.fbtraceId,
            }
          : undefined,
      context,
    },
  };
}

/**
 * Create a success envelope.
 */
export function toSuccessEnvelope<T>(
  data: T,
  requestId?: string
): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    requestId,
  };
}

/**
 * Format an envelope as an MCP tool response.
 */
export function formatToolResponse(
  envelope: ErrorEnvelope | SuccessEnvelope<unknown>
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope, null, 2),
      },
    ],
    isError: envelope.success === false ? true : undefined,
  };
}
