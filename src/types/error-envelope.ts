/**
 * Structured error and success envelope types for consistent tool responses.
 */

/**
 * Standardized error codes for Meta MCP.
 */
export type ErrorCode =
  | "META_AUTH_EXPIRED"
  | "META_AUTH_INVALID"
  | "META_PERMISSION_DENIED"
  | "META_RATE_LIMIT_USER"
  | "META_RATE_LIMIT_APP"
  | "META_RATE_LIMIT_ACCOUNT"
  | "META_VALIDATION_ERROR"
  | "META_RESOURCE_NOT_FOUND"
  | "META_TIMEOUT"
  | "META_NETWORK_ERROR"
  | "META_INTERNAL_ERROR"
  | "MCP_INTERNAL_ERROR"
  | "MCP_INVALID_PARAMS";

/**
 * Error details from Meta API.
 */
export interface ErrorDetails {
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
  metaErrorType?: string;
  fbtraceId?: string;
  requestId?: string;
}

/**
 * Structured error envelope for tool responses.
 */
export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    details?: ErrorDetails;
    context?: Record<string, unknown>;
  };
}

/**
 * Structured success envelope for tool responses.
 */
export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId?: string;
}

/**
 * Union type for tool responses.
 */
export type ToolResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * Dry-run validation result.
 */
export interface DryRunValidation {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Dry-run response envelope.
 */
export interface DryRunEnvelope {
  success: true;
  dry_run: true;
  validation: DryRunValidation;
  preview: {
    operation: string;
    payload: Record<string, unknown>;
    estimatedCost?: number;
  };
}

/**
 * Parsed Meta API error structure.
 */
export interface ParsedMetaError {
  code: number;
  subcode?: number;
  type: string;
  message: string;
  userTitle?: string;
  userMessage?: string;
  fbtraceId?: string;
  isTransient: boolean;
  retryAfterMs?: number;
  errorData?: Record<string, unknown>;
}

/**
 * Human-readable error mappings.
 */
export const ERROR_MESSAGES: Record<number, string> = {
  1: "An unknown error occurred. Please try again.",
  2: "The service is temporarily unavailable. Please try again later.",
  4: "Application request limit reached. Please wait a few minutes.",
  10: "You don't have permission to access this resource.",
  17: "You've made too many API calls. Please wait a few minutes.",
  100: "Invalid parameter provided. Please check your request.",
  102: "Your session has expired. Please re-authenticate.",
  190: "Your access token has expired or is invalid. Please re-authenticate.",
  200: "You don't have permission for this operation.",
  294: "Managing advertisements requires completing identity verification.",
  368: "The content has been blocked for policy violations.",
  613: "Rate limit reached for this call. Please wait and try again.",
  2446079: "User request limit reached. Please wait a few minutes.",
};

/**
 * Error code to ErrorCode mapping.
 */
export const META_ERROR_CODE_MAP: Record<number, ErrorCode> = {
  1: "META_INTERNAL_ERROR",
  2: "META_INTERNAL_ERROR",
  4: "META_RATE_LIMIT_APP",
  10: "META_PERMISSION_DENIED",
  17: "META_RATE_LIMIT_USER",
  100: "META_VALIDATION_ERROR",
  102: "META_AUTH_EXPIRED",
  190: "META_AUTH_EXPIRED",
  200: "META_PERMISSION_DENIED",
};
