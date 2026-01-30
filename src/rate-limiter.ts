import { logger } from './logging.js';

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Whether to block requests that exceed the limit */
  blockOnLimit: boolean;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  blocked: boolean;
}

/**
 * In-memory rate limiter for DoS protection
 * Uses sliding window algorithm
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private config: RateLimiterConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxRequests: config.maxRequests ?? 100,
      windowMs: config.windowMs ?? 60000, // 1 minute
      blockOnLimit: config.blockOnLimit ?? true
    };

    // Cleanup expired buckets every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if request is allowed under the rate limit
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    // No existing bucket or bucket has expired
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetIn: this.config.windowMs,
        blocked: false
      };
    }

    // Existing bucket, check limit
    const newCount = bucket.count + 1;
    const remaining = Math.max(0, this.config.maxRequests - newCount);
    const resetIn = bucket.resetAt - now;

    if (newCount > this.config.maxRequests) {
      logger.warn('Rate limit exceeded', { key, count: newCount, max: this.config.maxRequests });
      return {
        allowed: !this.config.blockOnLimit,
        remaining: 0,
        resetIn,
        blocked: this.config.blockOnLimit
      };
    }

    bucket.count = newCount;
    return {
      allowed: true,
      remaining,
      resetIn,
      blocked: false
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.buckets.delete(key);
    logger.debug('Rate limit reset', { key });
  }

  /**
   * Get current usage for a key
   */
  getUsage(key: string): { count: number; remaining: number; resetIn: number } | null {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) {
      return null;
    }

    return {
      count: bucket.count,
      remaining: Math.max(0, this.config.maxRequests - bucket.count),
      resetIn: bucket.resetAt - Date.now()
    };
  }

  /**
   * Cleanup expired buckets
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Rate limiter cleanup', { cleaned });
    }
  }

  /**
   * Destroy the rate limiter
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.buckets.clear();
  }
}

// Default rate limiter instance
export const rateLimiter = new RateLimiter();
