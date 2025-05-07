import type { CloudflareOptions } from './client';

/**
 * Merges the options passed in from the user with the options we read from
 * the Cloudflare `env` environment variable object.
 *
 * @param userOptions - The options passed in from the user.
 * @param env - The environment variables.
 *
 * @returns The final options.
 */
export function getFinalOptions(userOptions: CloudflareOptions, env: unknown): CloudflareOptions {
  if (typeof env !== 'object' || env === null) {
    return userOptions;
  }

  const release = 'SENTRY_RELEASE' in env && typeof env.SENTRY_RELEASE === 'string' ? env.SENTRY_RELEASE : undefined;

  return { release, ...userOptions };
}
