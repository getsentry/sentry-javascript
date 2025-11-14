/**
 * Safely gets an environment variable value with defensive guards for browser environments.
 * Checks process.env which is transformed by most bundlers (Webpack, Vite, Rollup, Rspack, Parcel, etc.)
 * at build time.
 *
 * Note: We don't check import.meta.env because:
 * 1. Bundlers only replace static references like `import.meta.env.VITE_VAR`, not dynamic access
 * 2. Dynamic access causes syntax errors in unsupported environments
 * 3. Most bundlers transform process.env references anyway
 *
 * @param key - The environment variable key to look up
 * @returns The value of the environment variable or undefined if not found
 */
export function getEnvValue(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const value = process.env[key];
      if (value !== undefined) {
        return value;
      }
    }
  } catch (e) {
    // Silently ignore - process might not be accessible or might throw in some environments
  }

  return undefined;
}
