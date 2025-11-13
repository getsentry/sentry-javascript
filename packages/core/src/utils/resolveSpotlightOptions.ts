/**
 * Resolves the final spotlight configuration based on options and environment variables.
 * Implements the precedence rules from the Spotlight spec.
 *
 * @param optionsSpotlight - The spotlight option from user config (false | true | string | undefined)
 * @param envSpotlight - The spotlight value from environment variables (false | true | string | undefined)
 * @returns The resolved spotlight configuration
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
    return optionsSpotlight;
  }

  // optionsSpotlight is true or undefined
  const envBool = typeof envSpotlight === 'boolean' ? envSpotlight : undefined;
  const envUrl = typeof envSpotlight === 'string' ? envSpotlight : undefined;

  return optionsSpotlight === true
    ? (envUrl ?? true) // true: use env URL if present, otherwise true
    : (envBool ?? envUrl); // undefined: use env var (bool or URL)
}
