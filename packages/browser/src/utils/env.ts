/**
 * Safely gets an environment variable value with defensive guards for browser environments.
 * Checks multiple sources to support different bundlers:
 * - process.env: Webpack, Next.js, Create React App, Parcel, Vite (via define config)
 * - globalThis: Turbopack and other bundlers that inject values at runtime
 *
 * Note: We intentionally don't check import.meta.env because it causes syntax errors
 * in CJS builds. Vite users should use `define` config to inject env vars into process.env,
 * or the SDK will fall back to checking globalThis.
 *
 * @param key - The environment variable key to look up
 * @returns The value of the environment variable or undefined if not found
 */
export function getEnvValue(key: string): string | undefined {
  // Check process.env first (Webpack, Next.js, CRA, Vite with define, etc.)
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
