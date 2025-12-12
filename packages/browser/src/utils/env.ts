/**
 * Safely gets an environment variable value with defensive guards for browser environments.
 * Checks multiple sources to support different bundlers:
 * - process.env: Webpack, Next.js, Create React App, Parcel, Vite (via define config)
 * - globalThis: Turbopack and other bundlers that inject values at runtime
 *
 * Note: We intentionally don't check import.meta.env because it causes syntax errors
 * in CJS builds.
 *
 * IMPORTANT:
 * Some bundlers (notably Next.js/Turbopack) replace `process.env.MY_VAR` at build time
 * only for *static* property access. Dynamic access like `process.env[key]` may not get
 * replaced and can therefore be `undefined` at runtime.
 *
 * To support these environments, we include a small set of explicit checks for known
 * Spotlight env vars. This keeps Spotlight auto-configuration fully automatic (no user
 * wiring required) even when custom loaders are not applied.
 *
 * @param key - The environment variable key to look up
 * @returns The value of the environment variable or undefined if not found
 */
export function getEnvValue(key: string): string | undefined {
  // Check process.env first (Webpack, Next.js, CRA, Vite with define, etc.)
  try {
    if (typeof process !== 'undefined' && process.env) {
      // Prefer static access for known Spotlight env keys (see note above).
      // This enables Next.js/Turbopack to inline these values at build time.
      const spotlightValue = getSpotlightEnvValueFromProcessEnv(key);
      if (spotlightValue !== undefined) {
        return spotlightValue;
      }

      const value = process.env[key];
      if (value !== undefined) {
        return value;
      }
    }
  } catch (e) {
    // Silently ignore - process might not be accessible or might throw in some environments
  }

  // Check globalThis for bundler-injected values (e.g., Turbopack's valueInjectionLoader)
  try {
    if (typeof globalThis !== 'undefined') {
      const value = (globalThis as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  } catch (e) {
    // Silently ignore
  }

  return undefined;
}

function getSpotlightEnvValueFromProcessEnv(key: string): string | undefined {
  // Keep this list in sync with `packages/browser/src/utils/spotlightConfig.ts`.
  switch (key) {
    case 'PUBLIC_SENTRY_SPOTLIGHT':
      return process.env.PUBLIC_SENTRY_SPOTLIGHT;
    case 'NEXT_PUBLIC_SENTRY_SPOTLIGHT':
      return process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;
    case 'VITE_SENTRY_SPOTLIGHT':
      return process.env.VITE_SENTRY_SPOTLIGHT;
    case 'NUXT_PUBLIC_SENTRY_SPOTLIGHT':
      return process.env.NUXT_PUBLIC_SENTRY_SPOTLIGHT;
    case 'REACT_APP_SENTRY_SPOTLIGHT':
      return process.env.REACT_APP_SENTRY_SPOTLIGHT;
    case 'VUE_APP_SENTRY_SPOTLIGHT':
      return process.env.VUE_APP_SENTRY_SPOTLIGHT;
    case 'GATSBY_SENTRY_SPOTLIGHT':
      return process.env.GATSBY_SENTRY_SPOTLIGHT;
    case 'SENTRY_SPOTLIGHT':
      return process.env.SENTRY_SPOTLIGHT;
    default:
      return undefined;
  }
}
