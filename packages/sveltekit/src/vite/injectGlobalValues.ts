import type { InternalGlobal } from '@sentry/utils';

export type GlobalSentryValues = {
  __sentry_sveltekit_output_dir?: string;
};

/**
 * Extend the `global` type with custom properties that are
 * injected by the SvelteKit SDK at build time.
 * @see packages/sveltekit/src/vite/sourcemaps.ts
 */
export type GlobalWithSentryValues = InternalGlobal & GlobalSentryValues;

export const VIRTUAL_GLOBAL_VALUES_FILE = '\0sentry-inject-global-values-file';

/**
 * @returns code that injects @param globalSentryValues into the global scope.
 */
export function getGlobalValueInjectionCode(globalSentryValues: GlobalSentryValues): string {
  if (Object.keys(globalSentryValues).length === 0) {
    return '';
  }

  const sentryGlobal = '_global';

  const globalCode = `var ${sentryGlobal} =
  typeof window !== 'undefined' ?
    window :
    typeof globalThis !== 'undefined' ?
      globalThis :
      typeof global !== 'undefined' ?
        global :
        typeof self !== 'undefined' ?
          self :
          {};`;
  const injectedValuesCode = Object.entries(globalSentryValues)
    .map(([key, value]) => `${sentryGlobal}["${key}"] = ${JSON.stringify(value)};`)
    .join('\n');

  return `${globalCode}\n${injectedValuesCode}\n`;
}
