import { debug } from './debug-logger';
import { envToBool } from './envToBool';

/**
 * Spotlight configuration option type.
 * - `undefined` - not configured
 * - `false` - explicitly disabled
 * - `true` - enabled with default URL (http://localhost:8969/stream)
 * - `string` - enabled with custom URL
 */
export type SpotlightConnectionOptions = boolean | string | undefined;

/**
 * Parses a SENTRY_SPOTLIGHT environment variable value.
 *
 * Per the Spotlight spec:
 * - Truthy values ("true", "t", "y", "yes", "on", "1") -> true
 * - Falsy values ("false", "f", "n", "no", "off", "0") -> false
 * - Any other non-empty string -> treated as URL
 * - Empty string or undefined -> undefined
 *
 * @see https://develop.sentry.dev/sdk/expected-features/spotlight.md
 */
export function parseSpotlightEnvValue(envValue: string | undefined): SpotlightConnectionOptions {
  if (envValue === undefined || envValue === '') {
    return undefined;
  }

  // Try strict boolean parsing first
  const boolValue = envToBool(envValue, { strict: true });
  if (boolValue !== null) {
    return boolValue;
  }

  // Not a boolean - treat as URL
  return envValue;
}

/**
 * Resolves the final Spotlight configuration value based on the config option and environment variable.
 *
 * Precedence rules (per spec):
 * 1. Config `false` -> DISABLED (ignore env var, log warning)
 * 2. Config URL string -> USE CONFIG URL (log warning if env var also set to URL)
 * 3. Config `true` + Env URL -> USE ENV VAR URL (this is the key case!)
 * 4. Config `true` + Env bool/undefined -> USE DEFAULT URL (true)
 * 5. Config `undefined` -> USE ENV VAR VALUE
 *
 * @see https://develop.sentry.dev/sdk/expected-features/spotlight.md
 */
export function resolveSpotlightValue(
  optionValue: SpotlightConnectionOptions,
  envValue: SpotlightConnectionOptions,
): SpotlightConnectionOptions {
  // Case 1: Config explicitly disables Spotlight
  if (optionValue === false) {
    if (envValue !== undefined) {
      // Per spec: MUST warn when config false ignores env var
      debug.warn('Spotlight disabled via config, ignoring SENTRY_SPOTLIGHT environment variable');
    }
    return false;
  }

  // Case 2: Config provides explicit URL
  if (typeof optionValue === 'string') {
    if (typeof envValue === 'string') {
      // Per spec: MUST warn when config URL overrides env var URL
      debug.warn('Spotlight config URL takes precedence over SENTRY_SPOTLIGHT environment variable');
    }
    return optionValue;
  }

  // Case 3 & 4: Config is true - enable Spotlight
  if (optionValue === true) {
    // Per spec: If config true AND env var is URL, MUST use env var URL
    // This enables `spotlight: true` in code while `spotlight run` provides the URL
    return typeof envValue === 'string' ? envValue : true;
  }

  // Case 5: Config undefined - fully defer to env var
  return envValue;
}
