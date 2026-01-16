import type { CloudflareOptions } from './client';

/**
 * Cloudflare's version metadata binding structure.
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/
 */
interface CfVersionMetadata {
  id: string;
  tag?: string;
  timestamp?: string;
}

/**
 * Checks if the value is a valid CF_VERSION_METADATA binding.
 */
function isVersionMetadata(value: unknown): value is CfVersionMetadata {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

/**
 * Merges the options passed in from the user with the options we read from
 * the Cloudflare `env` environment variable object.
 *
 * Release is determined with the following priority (highest to lowest):
 * 1. User-provided release option
 * 2. SENTRY_RELEASE environment variable
 * 3. CF_VERSION_METADATA.id binding (if configured in wrangler.toml)
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

  // Priority: SENTRY_RELEASE > CF_VERSION_METADATA.id
  let release: string | undefined;
  if ('SENTRY_RELEASE' in env && typeof env.SENTRY_RELEASE === 'string') {
    release = env.SENTRY_RELEASE;
  } else if ('CF_VERSION_METADATA' in env && isVersionMetadata(env.CF_VERSION_METADATA)) {
    release = env.CF_VERSION_METADATA.id;
  }

  return { release, ...userOptions };
}
