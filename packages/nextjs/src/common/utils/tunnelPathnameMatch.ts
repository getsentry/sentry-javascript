/**
 * Returns true only for requests the tunnel rewrite (see `setUpTunnelRewriteRules`) would serve.
 *
 * This decides whether the user's middleware is skipped, so it must never be broader than the rewrite:
 * anything it matches that Next.js does not rewrite to Sentry reaches the app without middleware.
 */
export function isSentryTunnelRequest(request: Request, tunnelPath: string): boolean {
  // The SDK transport only ever sends POST requests
  if (request.method !== 'POST') {
    return false;
  }

  const url = new URL(request.url);

  if (url.pathname !== tunnelPath && url.pathname !== `${tunnelPath}/`) {
    return false;
  }

  // Next.js evaluates `has` conditions against the last value of a repeated query param, so every value has to qualify
  return ['o', 'p'].every(key => {
    const values = url.searchParams.getAll(key);
    return values.length > 0 && values.every(value => /^\d+$/.test(value));
  });
}
