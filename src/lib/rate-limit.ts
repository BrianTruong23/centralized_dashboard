import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// For production with multiple instances, consider using Redis or Vercel KV
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;
  /**
   * Time window in milliseconds
   */
  windowMs: number;
  /**
   * Optional message to return when rate limit is exceeded
   */
  message?: string;
}

/**
 * Rate limiting middleware for API routes
 * Tracks requests by IP address with a sliding window
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const rateLimitResult = await rateLimit(request, {
 *     maxRequests: 10,
 *     windowMs: 60 * 1000, // 1 minute
 *   });
 *
 *   if (rateLimitResult) {
 *     return rateLimitResult; // Returns 429 response
 *   }
 *
 *   // Continue with your API logic
 * }
 * ```
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const { maxRequests, windowMs, message } = config;

  // Get client identifier (IP address)
  const clientId = getClientIdentifier(request);

  const now = Date.now();
  const entry = rateLimitStore.get(clientId);

  if (!entry || entry.resetTime < now) {
    // New window or expired window
    rateLimitStore.set(clientId, {
      count: 1,
      resetTime: now + windowMs,
    });
    return null; // Allow request
  }

  if (entry.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    return NextResponse.json(
      {
        error: message || 'Too many requests. Please try again later.',
        retryAfter: retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetTime.toString(),
        },
      }
    );
  }

  // Increment request count
  entry.count += 1;
  rateLimitStore.set(clientId, entry);

  return null; // Allow request
}

/**
 * Get a unique identifier for the client making the request
 * Uses IP address from various headers, falling back to a default
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get IP from various headers (common in production with proxies/CDNs)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare

  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback for local development or when IP is not available
  // Use a combination of user-agent and a timestamp-based identifier
  return 'local-dev';
}

/**
 * Preset rate limit configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict rate limit: 10 requests per minute
   * Good for expensive operations like AI summarization
   */
  strict: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
  /**
   * Standard rate limit: 30 requests per minute
   * Good for typical API endpoints
   */
  standard: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  /**
   * Generous rate limit: 100 requests per minute
   * Good for frequently accessed, lightweight endpoints
   */
  generous: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
} as const;
