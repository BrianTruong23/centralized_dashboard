import { NextRequest } from 'next/server';
import { rateLimit, RateLimitPresets } from './rate-limit';

// Helper to create mock NextRequest
function createMockRequest(ip: string = '127.0.0.1'): NextRequest {
  return {
    headers: new Headers({
      'x-forwarded-for': ip,
    }),
    nextUrl: new URL('http://localhost:3000/api/test'),
  } as NextRequest;
}

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Clear rate limit store between tests
    jest.clearAllMocks();
  });

  it('should allow requests within the rate limit', async () => {
    const request = createMockRequest('192.168.1.1');
    const config = { maxRequests: 5, windowMs: 60000 };

    // First 5 requests should be allowed
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit(request, config);
      expect(result).toBeNull();
    }
  });

  it('should block requests exceeding the rate limit', async () => {
    const request = createMockRequest('192.168.1.2');
    const config = { maxRequests: 3, windowMs: 60000 };

    // First 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(request, config);
      expect(result).toBeNull();
    }

    // 4th request should be blocked
    const blockedResult = await rateLimit(request, config);
    expect(blockedResult).not.toBeNull();
    expect(blockedResult?.status).toBe(429);
  });

  it('should return proper rate limit headers when blocked', async () => {
    const request = createMockRequest('192.168.1.3');
    const config = { maxRequests: 2, windowMs: 60000 };

    // Exhaust rate limit
    await rateLimit(request, config);
    await rateLimit(request, config);

    // Get blocked response
    const blockedResult = await rateLimit(request, config);
    expect(blockedResult).not.toBeNull();

    const headers = blockedResult!.headers;
    expect(headers.get('X-RateLimit-Limit')).toBe('2');
    expect(headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(headers.get('Retry-After')).toBeTruthy();
  });

  it('should handle different IPs independently', async () => {
    const config = { maxRequests: 2, windowMs: 60000 };

    const request1 = createMockRequest('192.168.1.4');
    const request2 = createMockRequest('192.168.1.5');

    // Exhaust limit for IP 1
    await rateLimit(request1, config);
    await rateLimit(request1, config);
    const blocked1 = await rateLimit(request1, config);
    expect(blocked1?.status).toBe(429);

    // IP 2 should still be allowed
    const allowed2 = await rateLimit(request2, config);
    expect(allowed2).toBeNull();
  });

  it('should use strict preset correctly', async () => {
    const request = createMockRequest('192.168.1.6');

    // Strict preset: 10 requests per minute
    expect(RateLimitPresets.strict.maxRequests).toBe(10);
    expect(RateLimitPresets.strict.windowMs).toBe(60000);

    // Should allow 10 requests
    for (let i = 0; i < 10; i++) {
      const result = await rateLimit(request, RateLimitPresets.strict);
      expect(result).toBeNull();
    }

    // 11th should be blocked
    const blocked = await rateLimit(request, RateLimitPresets.strict);
    expect(blocked?.status).toBe(429);
  });

  it('should include custom message when provided', async () => {
    const request = createMockRequest('192.168.1.7');
    const config = {
      maxRequests: 1,
      windowMs: 60000,
      message: 'Custom rate limit message',
    };

    // Exhaust limit
    await rateLimit(request, config);

    // Get blocked response
    const blockedResult = await rateLimit(request, config);
    const json = await blockedResult!.json();
    expect(json.error).toBe('Custom rate limit message');
  });

  it('should extract IP from x-forwarded-for header', async () => {
    const request = createMockRequest('10.0.0.1, 192.168.1.8');
    const config = { maxRequests: 1, windowMs: 60000 };

    // First request should be allowed
    const result1 = await rateLimit(request, config);
    expect(result1).toBeNull();

    // Second request from same IP should be blocked
    const result2 = await rateLimit(request, config);
    expect(result2?.status).toBe(429);
  });
});
