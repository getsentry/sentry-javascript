/**
 * Resolves the final spotlight configuration based on options and environment variables.
 * Implements the precedence rules from the Spotlight spec.
 *
 * This is the single source of truth for filtering empty/whitespace strings - it ensures that
 * empty strings are NEVER returned (returns undefined instead). All callers can rely on this
 * guarantee when handling spotlight configuration.
 *
 * @param optionsSpotlight - The spotlight option from user config (false | true | string | undefined)
 * @param envSpotlight - The spotlight value from environment variables (false | true | string | undefined)
 * @returns The resolved spotlight configuration (false | true | string | undefined) - NEVER an empty string
 */
export function resolveSpotlightOptions(
  optionsSpotlight: boolean | string | undefined,
  envSpotlight: boolean | string | undefined,
): boolean | string | undefined {
  if (optionsSpotlight === false) {
    // Explicitly disabled - ignore env vars
    return false;
  }

  if (typeof optionsSpotlight === 'string') {
    // Custom URL provided - ignore env vars
    // Treat empty strings as undefined to prevent invalid URL connections
    return optionsSpotlight.trim() === '' ? undefined : optionsSpotlight;
  }

  // optionsSpotlight is true or undefined
  const envBool = typeof envSpotlight === 'boolean' ? envSpotlight : undefined;
  // Treat empty/whitespace-only strings as undefined to prevent invalid URL connections
  const envUrl = typeof envSpotlight === 'string' && envSpotlight.trim() !== '' ? envSpotlight : undefined;

  return optionsSpotlight === true
    ? (envUrl ?? true) // true: use env URL if present, otherwise true
    : (envBool ?? envUrl); // undefined: use env var (bool or URL)
}
