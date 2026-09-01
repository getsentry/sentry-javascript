import { escapeStringForRegex, type InternalGlobal } from '@sentry/core';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import type { ResolvedKitConfig } from './kitConfig';
import { getHooksFileName } from './svelteConfig';

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

type GlobalValuesInjectionOptions = {
  getKitConfig: () => Promise<ResolvedKitConfig>;
  getAdapterOutputDir: () => Promise<string>;
  debug?: boolean;
};

/**
 * Injects SvelteKit app configuration values into the server's global object
 * so that the SDK can pick up the information at runtime.
 */
export function makeGlobalValuesInjectionPlugin(options: GlobalValuesInjectionOptions): Plugin {
  const { getKitConfig, getAdapterOutputDir, debug = false } = options;

  // The SvelteKit config is only available once Vite has resolved its plugins, so we compute
  // the injected values lazily (but only once) instead of at plugin creation time.
  let injectionValuesPromise: Promise<{ globalSentryValues: GlobalSentryValues; hooksFileRegexp: RegExp }> | undefined;

  const getInjectionValues = (): Promise<{ globalSentryValues: GlobalSentryValues; hooksFileRegexp: RegExp }> =>
    (injectionValuesPromise ??= (async () => {
      const kitConfig = await getKitConfig();

      const serverHooksFile = getHooksFileName(kitConfig, 'server');
      const adapterOutputDir = await getAdapterOutputDir();

      const globalSentryValues: GlobalSentryValues = {
        __sentry_sveltekit_output_dir: adapterOutputDir,
      };

      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[Sentry SvelteKit] Global values:', globalSentryValues);
      }

      return {
        globalSentryValues,
        // oxlint-disable-next-line sdk/no-regexp-constructor -- not end user input + escaped anyway
        hooksFileRegexp: new RegExp(`/${escapeStringForRegex(serverHooksFile)}(.(js|ts|mjs|mts))?`),
      };
    })());

  return {
    name: 'sentry-sveltekit-global-values-injection-plugin',

    // Eagerly, not on the first `transform`: see the note on the adapter output dir in
    // `sentrySvelteKit()`. Awaited so a failure surfaces as a config error, not a stray rejection.
    configResolved: async () => {
      await getInjectionValues();
    },

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

    load: async id => {
      if (id === VIRTUAL_GLOBAL_VALUES_FILE) {
        const { globalSentryValues } = await getInjectionValues();
        return {
          code: getGlobalValueInjectionCode(globalSentryValues),
        };
      }
      return null;
    },

    transform: async (code, id) => {
      const { hooksFileRegexp } = await getInjectionValues();

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
