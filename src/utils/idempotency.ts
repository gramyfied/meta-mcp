/**
 * Idempotency key system for write operations.
 *
 * Prevents accidental duplicate operations by caching results
 * based on idempotency keys.
 */

import { randomUUID } from "crypto";
import { logger } from "./logger.js";

/**
 * Default TTL for idempotency cache entries (24 hours).
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum cache size to prevent memory issues.
 */
const MAX_CACHE_SIZE = 10000;

interface CacheEntry<T = unknown> {
  result: T;
  expiresAt: number;
  createdAt: number;
  operation: string;
}

/**
 * In-memory idempotency cache.
 * Can be extended to use Redis or other distributed cache.
 */
class IdempotencyCache {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a key exists and is still valid.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    logger.debug("Idempotency cache hit", {
      requestId: key,
      operation: entry.operation,
    });

    return entry.result as T;
  }

  /**
   * Store a result with the given key.
   */
  set<T>(key: string, result: T, operation: string, ttlMs = DEFAULT_TTL_MS): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldest(Math.floor(MAX_CACHE_SIZE * 0.1)); // Evict 10%
    }

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
      operation,
    });

    logger.debug("Idempotency cache set", {
      requestId: key,
      operation,
    });
  }

  /**
   * Check if a key exists (including expired).
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove a specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
    };
  }

  /**
   * Remove expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug("Idempotency cache cleanup", { removed });
    }
  }

  /**
   * Evict oldest entries when cache is full.
   */
  private evictOldest(count: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
    }

    logger.debug("Idempotency cache eviction", { evicted: entries.length });
  }

  /**
   * Stop the cleanup interval.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Global idempotency cache instance.
 */
export const idempotencyCache = new IdempotencyCache();

/**
 * Generate a unique idempotency key.
 */
export function generateIdempotencyKey(
  operation: string,
  params?: Record<string, unknown>
): string {
  // Include operation in the key for better traceability
  const uuid = randomUUID();
  return `${operation}:${uuid}`;
}

/**
 * Check if a request with the given key has already been processed.
 */
export function checkIdempotency<T>(key: string): T | null {
  return idempotencyCache.get<T>(key);
}

/**
 * Store the result of a request for idempotency.
 */
export function storeIdempotency<T>(
  key: string,
  result: T,
  operation: string,
  ttlMs = DEFAULT_TTL_MS
): void {
  idempotencyCache.set(key, result, operation, ttlMs);
}

/**
 * Execute an operation with idempotency support.
 */
export async function withIdempotency<T>(
  key: string | undefined,
  operation: string,
  execute: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<{ result: T; requestId: string; cached: boolean }> {
  // Generate a key if not provided
  const requestId = key || generateIdempotencyKey(operation);

  // Check for existing result
  const cached = checkIdempotency<T>(requestId);
  if (cached !== null) {
    return { result: cached, requestId, cached: true };
  }

  // Execute the operation
  const result = await execute();

  // Store the result
  storeIdempotency(requestId, result, operation, ttlMs);

  return { result, requestId, cached: false };
}

/**
 * Decorator-style function for adding idempotency to tool handlers.
 */
export function idempotent<TParams extends { idempotency_key?: string }, TResult>(
  operation: string,
  handler: (params: TParams) => Promise<TResult>,
  ttlMs = DEFAULT_TTL_MS
): (params: TParams) => Promise<{ result: TResult; requestId: string; cached: boolean }> {
  return async (params: TParams) => {
    return withIdempotency(
      params.idempotency_key,
      operation,
      () => handler(params),
      ttlMs
    );
  };
}
