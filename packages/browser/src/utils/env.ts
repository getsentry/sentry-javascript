/**
 * Safely gets an environment variable value with defensive guards for browser environments.
 * Checks multiple sources to support different bundlers:
 * - process.env: Webpack, Next.js, Create React App, Parcel (works in both ESM and CJS)
 * - import.meta.env: Vite, Astro, SvelteKit (ESM only - stripped from CJS builds)
 * - globalThis: Turbopack and other bundlers that inject values at runtime
 *
 * @param key - The environment variable key to look up
 * @returns The value of the environment variable or undefined if not found
 */
export function getEnvValue(key: string): string | undefined {
  // Check process.env first (Webpack, Next.js, CRA, etc.)
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

  /* rollup-esm-only */
  // Check import.meta.env (Vite, Astro, SvelteKit, etc.)
  // Note: This block is stripped from CJS builds to avoid syntax errors with import.meta
  try {
    // @ts-expect-error import.meta.env might not exist in all environments
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-expect-error import.meta.env is typed differently in different environments
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const value = import.meta.env[key];
      if (value !== undefined) {
        return value;
      }
    }
  } catch (e) {
    // Silently ignore - import.meta.env might not be accessible or might throw
  }
  /* rollup-esm-only-end */

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
