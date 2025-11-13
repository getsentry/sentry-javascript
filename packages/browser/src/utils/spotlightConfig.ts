import { debug, envToBool } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { getEnvValue } from './env';

/**
 * Environment variable keys to check for Spotlight configuration, in priority order.
 * The first one found with a value will be used.
 */
const SPOTLIGHT_ENV_KEYS = [
  'SENTRY_SPOTLIGHT', // Base/official name - works in Parcel, Webpack, Rspack, Rollup, Rolldown, Node.js
  'PUBLIC_SENTRY_SPOTLIGHT', // SvelteKit, Astro, Qwik
  'NEXT_PUBLIC_SENTRY_SPOTLIGHT', // Next.js
  'VITE_SENTRY_SPOTLIGHT', // Vite
  'NUXT_PUBLIC_SENTRY_SPOTLIGHT', // Nuxt
  'REACT_APP_SENTRY_SPOTLIGHT', // Create React App
  'VUE_APP_SENTRY_SPOTLIGHT', // Vue CLI
  'GATSBY_SENTRY_SPOTLIGHT', // Gatsby
] as const;

/**
 * Gets the Spotlight configuration from environment variables.
 * Checks multiple environment variable prefixes in priority order to support
 * different bundlers and frameworks.
 *
 * @returns The resolved Spotlight configuration (boolean | string | undefined)
 */
export function getSpotlightConfig(): boolean | string | undefined {
  for (const key of SPOTLIGHT_ENV_KEYS) {
    const value = getEnvValue(key);

    if (value !== undefined) {
      // Try to parse as boolean first (strict mode)
      const boolValue = envToBool(value, { strict: true });

      if (boolValue !== null) {
        // It's a valid boolean value
        if (DEBUG_BUILD) {
          debug.log(`[Spotlight] Found ${key}=${String(boolValue)} in environment variables`);
        }
        return boolValue;
      }

      // Not a boolean, treat as custom URL string
      if (DEBUG_BUILD) {
        debug.log(`[Spotlight] Found ${key}=${value} (custom URL) in environment variables`);
      }
      return value;
    }
  }

  // No Spotlight configuration found in environment
  return undefined;
}
