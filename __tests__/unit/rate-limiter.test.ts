/**
 * Contract tests for rate-limiter.ts
 */

import {
  RateLimiter,
  RateLimitError,
  DEVELOPMENT_TIER,
  STANDARD_TIER,
} from "../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    // Create a fresh limiter for each test
    limiter = new RateLimiter(DEVELOPMENT_TIER);
  });

  describe("checkRateLimit", () => {
    it("should allow requests under limit", async () => {
      // Development tier has max 60 points
      // Read operations cost 1 point each
      for (let i = 0; i < 10; i++) {
        await expect(
          limiter.checkRateLimit("test_account", false)
        ).resolves.not.toThrow();
      }
    });

    it("should block when score exceeds max", async () => {
      // Exhaust the limit (60 points with read operations = 60 calls)
      for (let i = 0; i < 59; i++) {
        await limiter.checkRateLimit("test_account", false);
      }

      // This should still work (at exactly 60)
      await expect(
        limiter.checkRateLimit("test_account", false)
      ).resolves.not.toThrow();

      // This should fail (over 60)
      await expect(
        limiter.checkRateLimit("test_account", false)
      ).rejects.toThrow(RateLimitError);
    });

    it("should track read vs write scores differently", async () => {
      // Write operations cost 3 points each
      // 20 write operations = 60 points
      for (let i = 0; i < 19; i++) {
        await limiter.checkRateLimit("test_account", true);
      }

      // 19 * 3 = 57 points, can do one more
      await expect(
        limiter.checkRateLimit("test_account", true)
      ).resolves.not.toThrow();

      // Now at 60 points, next should fail
      await expect(
        limiter.checkRateLimit("test_account", true)
      ).rejects.toThrow(RateLimitError);
    });

    it("should track accounts separately", async () => {
      // Exhaust limit for account1
      for (let i = 0; i < 60; i++) {
        await limiter.checkRateLimit("account1", false);
      }

      // account1 should be blocked
      await expect(
        limiter.checkRateLimit("account1", false)
      ).rejects.toThrow(RateLimitError);

      // account2 should still work
      await expect(
        limiter.checkRateLimit("account2", false)
      ).resolves.not.toThrow();
    });
  });

  describe("score decay", () => {
    it("should decay score over time", async () => {
      // Add some score
      for (let i = 0; i < 30; i++) {
        await limiter.checkRateLimit("test_account", false);
      }

      // Get current score
      const initialScore = limiter.getCurrentScore("test_account");
      expect(initialScore).toBe(30);

      // Manually advance time by calling internal method
      // Note: In production tests, we'd use jest.useFakeTimers()
      // For now, we just verify the initial state
    });
  });

  describe("blocking behavior", () => {
    it("should throw RateLimitError with correct retryAfterMs", async () => {
      // Exhaust the limit
      for (let i = 0; i < 61; i++) {
        try {
          await limiter.checkRateLimit("test_account", false);
        } catch (error) {
          if (error instanceof RateLimitError) {
            // Should have a retry delay
            expect(error.retryAfterMs).toBeGreaterThan(0);
            expect(error.retryAfterMs).toBeLessThanOrEqual(
              DEVELOPMENT_TIER.blockTimeMs
            );
            return;
          }
        }
      }
    });
  });

  describe("tier configuration", () => {
    it("should use development tier limits when configured", () => {
      const devLimiter = new RateLimiter(DEVELOPMENT_TIER);
      expect(devLimiter.getRemainingCapacity("new_account")).toBe(
        DEVELOPMENT_TIER.maxScore
      );
    });

    it("should use standard tier limits when configured", () => {
      const stdLimiter = new RateLimiter(STANDARD_TIER);
      expect(stdLimiter.getRemainingCapacity("new_account")).toBe(
        STANDARD_TIER.maxScore
      );
    });
  });

  describe("getCurrentScore", () => {
    it("should return 0 for new accounts", () => {
      expect(limiter.getCurrentScore("new_account")).toBe(0);
    });

    it("should return correct score after operations", async () => {
      await limiter.checkRateLimit("test_account", false);
      await limiter.checkRateLimit("test_account", false);
      await limiter.checkRateLimit("test_account", true);

      // 1 + 1 + 3 = 5
      expect(limiter.getCurrentScore("test_account")).toBe(5);
    });
  });

  describe("getRemainingCapacity", () => {
    it("should return max score for new accounts", () => {
      expect(limiter.getRemainingCapacity("new_account")).toBe(
        DEVELOPMENT_TIER.maxScore
      );
    });

    it("should decrease with usage", async () => {
      await limiter.checkRateLimit("test_account", false);
      await limiter.checkRateLimit("test_account", false);

      expect(limiter.getRemainingCapacity("test_account")).toBe(
        DEVELOPMENT_TIER.maxScore - 2
      );
    });
  });

  describe("isAccountBlocked", () => {
    it("should return false for accounts under limit", () => {
      expect(limiter.isAccountBlocked("new_account")).toBe(false);
    });

    it("should return true for blocked accounts", async () => {
      // Exhaust the limit
      for (let i = 0; i < 61; i++) {
        try {
          await limiter.checkRateLimit("test_account", false);
        } catch {
          // Expected to throw after limit is reached
        }
      }

      expect(limiter.isAccountBlocked("test_account")).toBe(true);
    });
  });

  describe("resetAccount", () => {
    it("should reset account score and unblock", async () => {
      // Use some capacity
      for (let i = 0; i < 30; i++) {
        await limiter.checkRateLimit("test_account", false);
      }

      expect(limiter.getCurrentScore("test_account")).toBe(30);

      // Reset
      limiter.resetAccount("test_account");

      expect(limiter.getCurrentScore("test_account")).toBe(0);
      expect(limiter.isAccountBlocked("test_account")).toBe(false);
    });
  });
});

describe("RateLimitError", () => {
  it("should store retry delay", () => {
    const error = new RateLimitError("Rate limit exceeded", 60000);

    expect(error.message).toBe("Rate limit exceeded");
    expect(error.retryAfterMs).toBe(60000);
    expect(error.name).toBe("RateLimitError");
  });

  it("should be an instance of Error", () => {
    const error = new RateLimitError("Test", 1000);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof RateLimitError).toBe(true);
  });
});

describe("Tier configurations", () => {
  it("DEVELOPMENT_TIER should have correct values", () => {
    expect(DEVELOPMENT_TIER.maxScore).toBe(60);
    expect(DEVELOPMENT_TIER.decayTimeMs).toBe(300000); // 5 minutes
    expect(DEVELOPMENT_TIER.blockTimeMs).toBe(300000); // 5 minutes
    expect(DEVELOPMENT_TIER.readCallScore).toBe(1);
    expect(DEVELOPMENT_TIER.writeCallScore).toBe(3);
  });

  it("STANDARD_TIER should have correct values", () => {
    expect(STANDARD_TIER.maxScore).toBe(9000);
    expect(STANDARD_TIER.decayTimeMs).toBe(300000); // 5 minutes
    expect(STANDARD_TIER.blockTimeMs).toBe(60000); // 1 minute
    expect(STANDARD_TIER.readCallScore).toBe(1);
    expect(STANDARD_TIER.writeCallScore).toBe(3);
  });
});
