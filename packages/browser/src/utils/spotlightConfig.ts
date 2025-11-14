import { debug, envToBool } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { getEnvValue } from './env';

/**
 * Environment variable keys to check for Spotlight configuration, in priority order.
 * The first one found with a value will be used.
 *
 * IMPORTANT: Framework-specific variables (PUBLIC_*, NEXT_PUBLIC_*, etc.) are prioritized
 * over the generic SENTRY_SPOTLIGHT to support Docker Compose setups where:
 * - Backend services need SENTRY_SPOTLIGHT=http://host.internal.docker:8969/stream
 * - Frontend code needs localhost (via framework-specific vars like NEXT_PUBLIC_SENTRY_SPOTLIGHT=http://localhost:8969/stream)
 *
 * SENTRY_SPOTLIGHT is kept as a fallback for:
 * - Simple non-Docker setups
 * - Remote Spotlight instances when no framework-specific var is set
 */
const SPOTLIGHT_ENV_KEYS = [
  'PUBLIC_SENTRY_SPOTLIGHT', // SvelteKit, Astro, Qwik
  'NEXT_PUBLIC_SENTRY_SPOTLIGHT', // Next.js
  'VITE_SENTRY_SPOTLIGHT', // Vite
  'NUXT_PUBLIC_SENTRY_SPOTLIGHT', // Nuxt
  'REACT_APP_SENTRY_SPOTLIGHT', // Create React App
  'VUE_APP_SENTRY_SPOTLIGHT', // Vue CLI
  'GATSBY_SENTRY_SPOTLIGHT', // Gatsby
  'SENTRY_SPOTLIGHT', // Fallback/base name - works in Parcel, Webpack, Rspack, Rollup, Rolldown, Node.js
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
      // Filter empty/whitespace strings to prevent invalid configurations
      if (value.trim() === '') {
        if (DEBUG_BUILD) {
          debug.log(`[Spotlight] Skipping ${key} with empty/whitespace value`);
        }
        continue;
      }

      if (DEBUG_BUILD) {
        debug.log(`[Spotlight] Found ${key}=${value} (custom URL) in environment variables`);
      }
      return value;
    }
  }

  // No Spotlight configuration found in environment
  return undefined;
}
