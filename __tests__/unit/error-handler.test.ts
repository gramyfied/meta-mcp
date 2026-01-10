/**
 * Contract tests for error-handler.ts
 */

import {
  MetaApiErrorHandler,
  MetaApiProcessingError,
  MetaAuthError,
  MetaPermissionError,
  MetaValidationError,
  MetaApplicationLimitError,
  MetaUserLimitError,
  parseMetaApiError,
  getHumanReadableError,
  getErrorCode,
  toErrorEnvelope,
  toSuccessEnvelope,
} from "../../src/utils/error-handler.js";
import { RateLimitError } from "../../src/utils/rate-limiter.js";
import {
  mockRateLimitError,
  mockAuthError,
  mockPermissionError,
  mockValidationError,
  mockAppLimitError,
} from "../fixtures/meta-api-responses.js";

describe("MetaApiErrorHandler", () => {
  describe("isMetaApiError", () => {
    it("should identify valid Meta API error objects", () => {
      expect(MetaApiErrorHandler.isMetaApiError(mockRateLimitError)).toBe(true);
      expect(MetaApiErrorHandler.isMetaApiError(mockAuthError)).toBe(true);
      expect(MetaApiErrorHandler.isMetaApiError(mockValidationError)).toBe(true);
    });

    it("should reject non-error objects", () => {
      expect(MetaApiErrorHandler.isMetaApiError(null)).toBe(false);
      expect(MetaApiErrorHandler.isMetaApiError(undefined)).toBe(false);
      expect(MetaApiErrorHandler.isMetaApiError({})).toBe(false);
      expect(MetaApiErrorHandler.isMetaApiError({ error: {} })).toBe(false);
      expect(MetaApiErrorHandler.isMetaApiError({ error: { message: "test" } })).toBe(false);
      expect(MetaApiErrorHandler.isMetaApiError("string error")).toBe(false);
    });

    it("should reject objects without numeric code", () => {
      expect(
        MetaApiErrorHandler.isMetaApiError({ error: { code: "string" } })
      ).toBe(false);
    });
  });

  describe("shouldRetry", () => {
    it("should return true for RateLimitError", () => {
      const error = new RateLimitError("Rate limit", 60000);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(true);
    });

    it("should return true for MetaApplicationLimitError", () => {
      const error = new MetaApplicationLimitError("App limit", 4, 1504022);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(true);
    });

    it("should return true for MetaUserLimitError", () => {
      const error = new MetaUserLimitError("User limit", 17, 2446079);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(true);
    });

    it("should return true for 5xx errors", () => {
      const error = new MetaApiProcessingError("Server error", 500);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(true);
    });

    it("should return true for 429 errors", () => {
      const error = new MetaApiProcessingError("Too many requests", 429);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(true);
    });

    it("should return false for validation errors", () => {
      const error = new MetaValidationError("Invalid param", 100);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(false);
    });

    it("should return false for auth errors", () => {
      const error = new MetaAuthError("Token expired", 190);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(false);
    });

    it("should return false for permission errors", () => {
      const error = new MetaPermissionError("No permission", 200);
      expect(MetaApiErrorHandler.shouldRetry(error)).toBe(false);
    });
  });

  describe("getRetryDelay", () => {
    it("should use retryAfterMs from RateLimitError", () => {
      const error = new RateLimitError("Rate limit", 120000);
      expect(MetaApiErrorHandler.getRetryDelay(error, 1)).toBe(120000);
    });

    it("should use exponential backoff for other errors", () => {
      const error = new MetaApiProcessingError("Server error", 500);

      // First attempt: 1000ms base + up to 1000ms jitter
      const delay1 = MetaApiErrorHandler.getRetryDelay(error, 1);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(3000);

      // Second attempt: 2000ms base + up to 1000ms jitter
      const delay2 = MetaApiErrorHandler.getRetryDelay(error, 2);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it("should cap delay at 60 seconds", () => {
      const error = new MetaApiProcessingError("Server error", 500);
      const delay = MetaApiErrorHandler.getRetryDelay(error, 10);
      expect(delay).toBeLessThanOrEqual(61000); // 60s + 1s jitter
    });
  });

  describe("getMaxRetries", () => {
    it("should return 3 for RateLimitError", () => {
      const error = new RateLimitError("Rate limit", 60000);
      expect(MetaApiErrorHandler.getMaxRetries(error)).toBe(3);
    });

    it("should return 2 for MetaApplicationLimitError", () => {
      const error = new MetaApplicationLimitError("App limit", 4);
      expect(MetaApiErrorHandler.getMaxRetries(error)).toBe(2);
    });

    it("should return 2 for MetaUserLimitError", () => {
      const error = new MetaUserLimitError("User limit", 17);
      expect(MetaApiErrorHandler.getMaxRetries(error)).toBe(2);
    });

    it("should return 3 for 5xx errors", () => {
      const error = new MetaApiProcessingError("Server error", 500);
      expect(MetaApiErrorHandler.getMaxRetries(error)).toBe(3);
    });

    it("should return 0 for non-retryable errors", () => {
      const authError = new MetaAuthError("Token expired", 190);
      expect(MetaApiErrorHandler.getMaxRetries(authError)).toBe(0);

      const validationError = new MetaValidationError("Invalid param", 100);
      expect(MetaApiErrorHandler.getMaxRetries(validationError)).toBe(0);
    });
  });
});

describe("parseMetaApiError", () => {
  it("should parse MetaApiProcessingError", () => {
    const error = new MetaApiProcessingError("Test error", 400, 100, 1234, "OAuthException");
    const parsed = parseMetaApiError(error);

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(100);
    expect(parsed?.subcode).toBe(1234);
    expect(parsed?.type).toBe("OAuthException");
    expect(parsed?.message).toBe("Test error");
  });

  it("should parse RateLimitError", () => {
    const error = new RateLimitError("Rate limit exceeded", 60000);
    const parsed = parseMetaApiError(error);

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(17);
    expect(parsed?.isTransient).toBe(true);
    expect(parsed?.retryAfterMs).toBe(60000);
  });

  it("should parse Meta API error objects", () => {
    const parsed = parseMetaApiError(mockAuthError);

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(190);
    expect(parsed?.type).toBe("OAuthException");
    expect(parsed?.fbtraceId).toBeDefined();
  });

  it("should parse error with JSON in message", () => {
    const error = new Error(JSON.stringify(mockValidationError));
    const parsed = parseMetaApiError(error);

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(100);
  });

  it("should parse string JSON errors", () => {
    const parsed = parseMetaApiError(JSON.stringify(mockPermissionError));

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(200);
  });

  it("should return null for unparseable input", () => {
    expect(parseMetaApiError(null)).toBeNull();
    expect(parseMetaApiError(undefined)).toBeNull();
    expect(parseMetaApiError(123)).toBeNull();
  });
});

describe("getHumanReadableError", () => {
  it("should return human-readable message for known error codes", () => {
    const parsed = parseMetaApiError(mockRateLimitError);
    expect(parsed).not.toBeNull();
    if (parsed) {
      const message = getHumanReadableError(parsed);
      expect(message).toContain("too many");
    }
  });

  it("should return user message if available", () => {
    const errorWithUserMsg = {
      error: {
        code: 999,
        message: "Technical error",
        type: "Test",
        error_user_msg: "Please try again later",
      },
    };
    const parsed = parseMetaApiError(errorWithUserMsg);
    expect(parsed).not.toBeNull();
    if (parsed) {
      const message = getHumanReadableError(parsed);
      expect(message).toBe("Please try again later");
    }
  });

  it("should fall back to original message", () => {
    const parsed = parseMetaApiError({
      error: { code: 99999, message: "Custom error message", type: "Unknown" },
    });
    expect(parsed).not.toBeNull();
    if (parsed) {
      const message = getHumanReadableError(parsed);
      expect(message).toBe("Custom error message");
    }
  });
});

describe("getErrorCode", () => {
  it("should return META_AUTH_EXPIRED for MetaAuthError", () => {
    const error = new MetaAuthError("Token expired", 190);
    expect(getErrorCode(error)).toBe("META_AUTH_EXPIRED");
  });

  it("should return META_PERMISSION_DENIED for MetaPermissionError", () => {
    const error = new MetaPermissionError("No permission", 200);
    expect(getErrorCode(error)).toBe("META_PERMISSION_DENIED");
  });

  it("should return META_VALIDATION_ERROR for MetaValidationError", () => {
    const error = new MetaValidationError("Invalid param", 100);
    expect(getErrorCode(error)).toBe("META_VALIDATION_ERROR");
  });

  it("should return META_RATE_LIMIT_APP for MetaApplicationLimitError", () => {
    const error = new MetaApplicationLimitError("App limit", 4);
    expect(getErrorCode(error)).toBe("META_RATE_LIMIT_APP");
  });

  it("should return META_RATE_LIMIT_USER for rate limit errors", () => {
    const userLimitError = new MetaUserLimitError("User limit", 17);
    expect(getErrorCode(userLimitError)).toBe("META_RATE_LIMIT_USER");

    const rateLimitError = new RateLimitError("Rate limit", 60000);
    expect(getErrorCode(rateLimitError)).toBe("META_RATE_LIMIT_USER");
  });

  it("should return META_INTERNAL_ERROR for 5xx errors", () => {
    const error = new MetaApiProcessingError("Server error", 500);
    expect(getErrorCode(error)).toBe("META_INTERNAL_ERROR");
  });

  it("should return META_RESOURCE_NOT_FOUND for 404 errors", () => {
    const error = new MetaApiProcessingError("Not found", 404);
    expect(getErrorCode(error)).toBe("META_RESOURCE_NOT_FOUND");
  });

  it("should return META_TIMEOUT for AbortError", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(getErrorCode(error)).toBe("META_TIMEOUT");
  });

  it("should return MCP_INTERNAL_ERROR for unknown errors", () => {
    const error = new Error("Unknown error");
    expect(getErrorCode(error)).toBe("MCP_INTERNAL_ERROR");
  });
});

describe("toErrorEnvelope", () => {
  it("should convert MetaAuthError to proper envelope", () => {
    const error = new MetaAuthError("Token expired", 190);
    const envelope = toErrorEnvelope(error);

    expect(envelope.success).toBe(false);
    expect(envelope.error.code).toBe("META_AUTH_EXPIRED");
    expect(envelope.error.retryable).toBe(false);
  });

  it("should include retryable: true for transient errors", () => {
    const error = new RateLimitError("Rate limit", 60000);
    const envelope = toErrorEnvelope(error);

    expect(envelope.success).toBe(false);
    expect(envelope.error.retryable).toBe(true);
    expect(envelope.error.retryAfterMs).toBe(60000);
  });

  it("should include error details for MetaApiProcessingError", () => {
    const error = new MetaApiProcessingError("Error", 400, 100, 1234, "OAuthException");
    const envelope = toErrorEnvelope(error);

    expect(envelope.error.details).toBeDefined();
    expect(envelope.error.details?.httpStatus).toBe(400);
    expect(envelope.error.details?.metaErrorCode).toBe(100);
    expect(envelope.error.details?.metaErrorSubcode).toBe(1234);
  });

  it("should include context when provided", () => {
    const error = new Error("Test error");
    const envelope = toErrorEnvelope(error, { operation: "test" });

    expect(envelope.error.context).toEqual({ operation: "test" });
  });
});

describe("toSuccessEnvelope", () => {
  it("should create success envelope with data", () => {
    const data = { id: "123", name: "Test" };
    const envelope = toSuccessEnvelope(data);

    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual(data);
    expect(envelope.requestId).toBeUndefined();
  });

  it("should include requestId when provided", () => {
    const data = { id: "123" };
    const envelope = toSuccessEnvelope(data, "req_abc123");

    expect(envelope.success).toBe(true);
    expect(envelope.requestId).toBe("req_abc123");
  });
});
