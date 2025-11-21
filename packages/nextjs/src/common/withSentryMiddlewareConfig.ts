import { GLOBAL_OBJ } from '@sentry/core';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string;
};

/**
 * Middleware config type for Next.js
 */
type MiddlewareConfig = {
  [key: string]: unknown;
  matcher?: string | string[];
};

/**
 * Configures middleware/proxy settings with Sentry-specific adjustments.
 * Automatically excludes the Sentry tunnel route from the matcher to prevent interference.
 *
 * @example
 * ```ts
 * // middleware.ts (Next.js <16)
 * import { withSentryMiddlewareConfig } from '@sentry/nextjs';
 *
 * export const config = withSentryMiddlewareConfig({
 *   matcher: ['/api/:path*', '/admin/:path*'],
 * });
 * ```
 *
 * @example
 * ```ts
 * // proxy.ts (Next.js 16+)
 * import { withSentryProxyConfig } from '@sentry/nextjs';
 *
 * export const config = withSentryProxyConfig({
 *   matcher: ['/api/:path*', '/admin/:path*'],
 * });
 * ```
 *
 * @param config - Middleware/proxy configuration object
 * @returns Updated config with Sentry tunnel route excluded from matcher
 */
export function withSentryMiddlewareConfig(config: MiddlewareConfig): MiddlewareConfig {
  const tunnelPath = process.env._sentryRewritesTunnelPath || globalWithInjectedValues._sentryRewritesTunnelPath;

  // If no tunnel path or no matcher, return config as-is
  if (!tunnelPath || !config.matcher) {
    return config;
  }

  // Convert to array for easier handling
  const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];

  // Add negated matcher for the tunnel route
  // This tells Next.js to NOT run middleware on the tunnel path
  const tunnelExclusion = `/((?!${tunnelPath.replace(/^\//, '')}).*)`;

  // Return updated config with tunnel exclusion
  return {
    ...config,
    matcher: [...matchers, tunnelExclusion],
  };
}

/**
 * Alias for `withSentryMiddlewareConfig` to support Next.js 16+ terminology.
 * In Next.js 16+, middleware files are called "proxy" files.
 *
 * @example
 * ```ts
 * // proxy.ts (Next.js 16+)
 * import { withSentryProxyConfig } from '@sentry/nextjs';
 *
 * export const config = withSentryProxyConfig({
 *   matcher: ['/api/:path*', '/admin/:path*'],
 * });
 * ```
 */
export const withSentryProxyConfig = withSentryMiddlewareConfig;
