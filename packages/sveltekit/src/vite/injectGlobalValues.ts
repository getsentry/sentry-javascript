import { escapeStringForRegex, type InternalGlobal } from '@sentry/core';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { type BackwardsForwardsCompatibleSvelteConfig, getAdapterOutputDir, getHooksFileName } from './svelteConfig';
import type { SentrySvelteKitPluginOptions } from './types';

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
 * @returns code that injects @param globalSentryValues into the global object.
 */
export function getGlobalValueInjectionCode(globalSentryValues: GlobalSentryValues): string {
  if (Object.keys(globalSentryValues).length === 0) {
    return '';
  }

  const injectedValuesCode = Object.entries(globalSentryValues)
    .map(([key, value]) => `globalThis["${key}"] = ${JSON.stringify(value)};`)
    .join('\n');

  return `${injectedValuesCode}\n`;
}

/**
 * Injects SvelteKit app configuration values the svelte.config.js into the
 * server's global object so that the SDK can pick up the information at runtime
 */
export async function makeGlobalValuesInjectionPlugin(
  svelteConfig: BackwardsForwardsCompatibleSvelteConfig,
  options: Pick<SentrySvelteKitPluginOptions, 'adapter' | 'debug'>,
): Promise<Plugin> {
  const { adapter = 'other', debug = false } = options;

  const serverHooksFile = getHooksFileName(svelteConfig, 'server');
  const adapterOutputDir = await getAdapterOutputDir(svelteConfig, adapter);

  const globalSentryValues: GlobalSentryValues = {
    __sentry_sveltekit_output_dir: adapterOutputDir,
  };

  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[Sentry SvelteKit] Global values:', globalSentryValues);
  }

  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- not end user input + escaped anyway
  const hooksFileRegexp = new RegExp(`/${escapeStringForRegex(serverHooksFile)}(.(js|ts|mjs|mts))?`);

  return {
    name: 'sentry-sveltekit-global-values-injection-plugin',
    resolveId: (id, _importer, _ref) => {
      if (id === VIRTUAL_GLOBAL_VALUES_FILE) {
        return {
          id: VIRTUAL_GLOBAL_VALUES_FILE,
          external: false,
          moduleSideEffects: true,
        };
      }
      return null;
    },

    load: id => {
      if (id === VIRTUAL_GLOBAL_VALUES_FILE) {
        return {
          code: getGlobalValueInjectionCode(globalSentryValues),
        };
      }
      return null;
    },

    transform: async (code, id) => {
      const isServerEntryFile = /instrumentation\.server\./.test(id) || hooksFileRegexp.test(id);

      if (isServerEntryFile) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('[Global Values Plugin] Injecting global values into', id);
        }
        const ms = new MagicString(code);
        ms.append(`\n; import "${VIRTUAL_GLOBAL_VALUES_FILE}";\n`);
        return {
          code: ms.toString(),
          map: ms.generateMap({ hires: true }),
        };
      }

      return null;
    },
  };
}
