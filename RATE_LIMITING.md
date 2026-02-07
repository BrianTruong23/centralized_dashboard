# Rate Limiting Implementation

## Overview

Rate limiting has been implemented across all API endpoints to prevent abuse and ensure fair usage of resources. The implementation uses an in-memory store with sliding window rate limiting.

## Implementation Details

### Core Module: `src/lib/rate-limit.ts`

The rate limiting module provides:

- **In-memory tracking**: Uses a Map to track requests by client IP
- **Sliding window algorithm**: Tracks request counts within time windows
- **Automatic cleanup**: Removes expired entries every 10 minutes
- **Standard HTTP headers**: Returns proper rate limit headers (Retry-After, X-RateLimit-*)
- **Client identification**: Extracts IP from various headers (x-forwarded-for, x-real-ip, cf-connecting-ip)

### Rate Limit Presets

Three preset configurations are available:

1. **Strict** (10 requests/minute)
   - Used for: Expensive operations (AI summarization)
   - Endpoint: `/api/summarize`

2. **Standard** (30 requests/minute)
   - Used for: Regular API operations
   - Endpoints: `/api/github/sync` (POST), `/api/github/issues`

3. **Generous** (100 requests/minute)
   - Used for: Lightweight, frequently accessed endpoints
   - Endpoint: `/api/github/sync` (GET)

## Protected Endpoints

### 1. `/api/summarize` (POST)
- **Rate Limit**: 10 requests per minute (Strict)
- **Reason**: Calls external AI API (OpenRouter), expensive operation

### 2. `/api/github/sync` (POST)
- **Rate Limit**: 30 requests per minute (Standard)
- **Reason**: Fetches GitHub issues, moderately expensive

### 3. `/api/github/sync` (GET)
- **Rate Limit**: 100 requests per minute (Generous)
- **Reason**: Simple config check, very lightweight

### 4. `/api/github/issues` (GET)
- **Rate Limit**: 30 requests per minute (Standard)
- **Reason**: Fetches GitHub issues with parameters

## Response Format

When rate limit is exceeded, the API returns:

**Status Code**: `429 Too Many Requests`

**Headers**:
- `Retry-After`: Seconds until the rate limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining (0 when blocked)
- `X-RateLimit-Reset`: Timestamp when the limit resets

**Body**:
```json
{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 45
}
```

## Usage Example

```typescript
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.standard);
  if (rateLimitResult) {
    return rateLimitResult; // Returns 429 response
  }

  // Continue with your API logic
  return NextResponse.json({ data: 'success' });
}
```

## Custom Rate Limits

You can create custom rate limit configurations:

```typescript
const customLimit = await rateLimit(request, {
  maxRequests: 50,
  windowMs: 5 * 60 * 1000, // 5 minutes
  message: 'Custom rate limit exceeded',
});
```

## Production Considerations

### Current Implementation (In-Memory)

**Pros**:
- Simple, no external dependencies
- Fast lookups
- Works immediately

**Cons**:
- Not shared across multiple server instances
- Data lost on server restart
- Limited to single-instance deployments

### Recommended for Production (Redis/Vercel KV)

For production deployments with multiple instances, consider upgrading to:

1. **Vercel KV** (for Vercel deployments)
   ```typescript
   import { kv } from '@vercel/kv';

   // Store rate limit data in distributed cache
   ```

2. **Redis** (for self-hosted)
   ```typescript
   import { Redis } from '@upstash/redis';

   // Use Redis for distributed rate limiting
   ```

3. **Upstash Rate Limit** (managed service)
   ```typescript
   import { Ratelimit } from '@upstash/ratelimit';

   const ratelimit = new Ratelimit({
     redis: Redis.fromEnv(),
     limiter: Ratelimit.slidingWindow(10, '60 s'),
   });
   ```

## Testing

Run the test suite:

```bash
npm test src/lib/rate-limit.test.ts
```

The test suite covers:
- Basic rate limiting functionality
- Multi-IP handling
- Header validation
- Preset configurations
- Custom messages

## Security Features

1. **IP-based tracking**: Prevents single user from overwhelming the API
2. **Graceful degradation**: Returns clear error messages
3. **Standard compliance**: Uses HTTP 429 status code
4. **Header support**: Works with proxies and CDNs (Cloudflare, Vercel, etc.)
5. **Memory management**: Automatic cleanup prevents memory leaks

## Monitoring

To monitor rate limiting in production, track:

1. **429 responses**: Count of rate-limited requests
2. **Client IPs**: Identify potential abuse patterns
3. **Endpoint patterns**: Which endpoints are being rate limited most
4. **False positives**: Legitimate users being blocked

Add logging in `rate-limit.ts`:

```typescript
if (entry.count >= maxRequests) {
  console.warn(`Rate limit exceeded for ${clientId} on ${request.url}`);
  // Send to monitoring service
}
```

## Future Enhancements

1. **User-specific limits**: Authenticated users get higher limits
2. **Dynamic limits**: Adjust based on server load
3. **Whitelist**: Skip rate limiting for trusted IPs
4. **Custom error pages**: Better UX for rate-limited users
5. **Analytics dashboard**: Visualize rate limit patterns

## Related Files

- `src/lib/rate-limit.ts` - Core implementation
- `src/lib/rate-limit.test.ts` - Test suite
- `src/app/api/summarize/route.ts` - Example usage
- `src/app/api/github/sync/route.ts` - Example usage
- `src/app/api/github/issues/route.ts` - Example usage
