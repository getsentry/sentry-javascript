import { GLOBAL_OBJ } from '@sentry/core';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string;
};

/**
 * Wraps a middleware matcher to automatically exclude the Sentry tunnel route.
 *
 * This is useful when you have a middleware matcher that would otherwise match
 * the Sentry tunnel route and potentially interfere with event delivery.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { withSentryTunnelExclusion } from '@sentry/nextjs';
 *
 * export const config = {
 *   matcher: withSentryTunnelExclusion([
 *     '/api/:path*',
 *     '/admin/:path*',
 *   ]),
 * };
 * ```
 *
 * @param matcher - Your middleware matcher (string or array of strings)
 * @returns A matcher that excludes the Sentry tunnel route
 */
export function withSentryTunnelExclusion(matcher: string | string[]): string | string[] {
  const tunnelPath = process.env._sentryRewritesTunnelPath || globalWithInjectedValues._sentryRewritesTunnelPath;
  if (!tunnelPath) {
    return matcher;
  }

  // Convert to array for easier handling
  const matchers = Array.isArray(matcher) ? matcher : [matcher];

  // Add negated matcher for the tunnel route
  // This tells Next.js to NOT run middleware on the tunnel path
  const tunnelExclusion = `/((?!${tunnelPath.replace(/^\//, '')}).*)`;

  // Combine with existing matchers
  return [...matchers, tunnelExclusion];
}
