// Keeping the key broad until we add the new transports
export type RateLimits = Record<string, number>;

export const DEFAULT_RETRY_AFTER = 60 * 1000; // 60 seconds

/**
 * Extracts Retry-After value from the request header or returns default value
 * @param header string representation of 'Retry-After' header
 * @param now current unix timestamp
 *
 */
export function parseRetryAfterHeader(header: string, now: number = Date.now()): number {
  const headerDelay = parseInt(`${header}`, 10);
  if (!isNaN(headerDelay)) {
    return headerDelay * 1000;
  }

  const headerDate = Date.parse(`${header}`);
  if (!isNaN(headerDate)) {
    return headerDate - now;
  }

  return DEFAULT_RETRY_AFTER;
}

/**
 * Gets the time that given category is disabled until for rate limiting
 */
export function disabledUntil(limits: RateLimits, category: string): number {
  return limits[category] || limits.all || 0;
}

/**
 * Checks if a category is rate limited
 */
export function isRateLimited(limits: RateLimits, category: string, now: number = Date.now()): boolean {
  return disabledUntil(limits, category) > now;
}

/**
 * Update ratelimits from incoming headers.
 * Returns true if headers contains a non-empty rate limiting header.
 */
export function updateRateLimits(
  limits: RateLimits,
  headers: Record<string, string | null | undefined>,
  now: number = Date.now(),
): RateLimits {
  const updatedRateLimits: RateLimits = {
    ...limits,
  };

  // "The name is case-insensitive."
  // https://developer.mozilla.org/en-US/docs/Web/API/Headers/get
  const rateLimitHeader = headers['x-sentry-rate-limits'];
  const retryAfterHeader = headers['retry-after'];

  if (rateLimitHeader) {
    /**
     * rate limit headers are of the form
     *     <header>,<header>,..
     * where each <header> is of the form
     *     <retry_after>: <categories>: <scope>: <reason_code>
     * where
     *     <retry_after> is a delay in seconds
     *     <categories> is the event type(s) (error, transaction, etc) being rate limited and is of the form
     *         <category>;<category>;...
     *     <scope> is what's being limited (org, project, or key) - ignored by SDK
     *     <reason_code> is an arbitrary string like "org_quota" - ignored by SDK
     */
    for (const limit of rateLimitHeader.trim().split(',')) {
      const parameters = limit.split(':', 2);
      const headerDelay = parseInt(parameters[0], 10);
      const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1000; // 60sec default
      if (!parameters[1]) {
        updatedRateLimits.all = now + delay;
      } else {
        for (const category of parameters[1].split(';')) {
          updatedRateLimits[category] = now + delay;
        }
      }
    }
  } else if (retryAfterHeader) {
    updatedRateLimits.all = now + parseRetryAfterHeader(retryAfterHeader, now);
  }

  return updatedRateLimits;
}
