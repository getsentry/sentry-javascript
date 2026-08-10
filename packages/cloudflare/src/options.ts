import { isObjectLike, envToBool } from '@sentry/core';
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
  return isObjectLike(value) && 'id' in value && typeof value.id === 'string';
}

function getEnvVar<T extends Record<string, unknown>>(env: unknown, varName: keyof T): string | undefined {
  return isObjectLike(env) && varName in env && typeof (env as T)[varName] === 'string'
    ? ((env as T)[varName] as string)
    : undefined;
}

/**
 * Merges the options passed in from the user with the options we read from
 * the Cloudflare `env` environment variable object.
 *
 * Release is determined with the following priority (highest to lowest):
 * 1. User-provided release option
 * 2. SENTRY_RELEASE environment variable
 * 3. CF_VERSION_METADATA.id binding (if configured in the wrangler config)
 *
 * @param userOptions - The options passed in from the user.
 * @param env - The environment variables.
 *
 * @returns The final options.
 */
export function getFinalOptions(userOptions: CloudflareOptions = {}, env: unknown): CloudflareOptions {
  if (typeof env !== 'object' || env === null) {
    return userOptions;
  }

  // Priority: userOptions.release > SENTRY_RELEASE > CF_VERSION_METADATA.id
  const release =
    'SENTRY_RELEASE' in env && typeof env.SENTRY_RELEASE === 'string'
      ? env.SENTRY_RELEASE
      : 'CF_VERSION_METADATA' in env && isVersionMetadata(env.CF_VERSION_METADATA)
        ? env.CF_VERSION_METADATA.id
        : undefined;

  const tracesSampleRate =
    userOptions.tracesSampleRate ?? parseFloat(getEnvVar(env, 'SENTRY_TRACES_SAMPLE_RATE') ?? '');

  // Spotlight precedence (mirrors node-core's getSpotlightConfig):
  // - false or explicit string from options: use as-is
  // - true: enable, but prefer a custom URL from the env var if set
  // - undefined: defer entirely to the env var (bool or URL)
  /*! rollup-include-development-only */
  const spotlight = getSpotlightFromEnv(userOptions.spotlight, getEnvVar(env, 'SENTRY_SPOTLIGHT'));
  /*! rollup-include-development-only-end */

  return {
    release,
    ...userOptions,
    dsn: userOptions.dsn ?? getEnvVar(env, 'SENTRY_DSN'),
    environment: userOptions.environment ?? getEnvVar(env, 'SENTRY_ENVIRONMENT'),
    tracesSampleRate: isFinite(tracesSampleRate) ? tracesSampleRate : undefined,
    debug: userOptions.debug ?? envToBool(getEnvVar(env, 'SENTRY_DEBUG')),
    tunnel: userOptions.tunnel ?? getEnvVar(env, 'SENTRY_TUNNEL'),
    /*! rollup-include-development-only */
    spotlight,
    /*! rollup-include-development-only-end */
  };
}

/**
 * Resolve the spotlight option from a user-supplied value and an env binding string.
 * Mirrors node-core's `getSpotlightConfig` precedence:
 *   - `false` or explicit string from options → use as-is
 *   - `true` → enable, but prefer a custom URL from the env var if set
 *   - `undefined` → defer entirely to the env var (bool or URL)
 */
function getSpotlightFromEnv(
  optionsSpotlight: boolean | string | undefined,
  envVar: string | undefined,
): boolean | string | undefined {
  if (optionsSpotlight === false) {
    return false;
  }
  if (typeof optionsSpotlight === 'string') {
    return optionsSpotlight;
  }

  // optionsSpotlight is true or undefined
  const envBool = envToBool(envVar, { strict: true });
  const envUrl = envBool === null && envVar ? envVar : undefined;

  return optionsSpotlight === true
    ? (envUrl ?? true) // true: use env URL if present, otherwise true
    : (envBool ?? envUrl); // undefined: use env var (bool or URL)
}
