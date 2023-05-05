/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin } from 'vite';

export const WRAPPED_MODULE_SUFFIX = '?sentry-auto-wrap';

export type AutoInstrumentSelection = {
  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your universal `load` functions declared in your `+page.(js|ts)` and `+layout.(js|ts)` files.
   *
   * @default true
   */
  load?: boolean;

  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your server-only `load` functions declared in your `+page.server.(js|ts)`
   * and `+layout.server.(js|ts)` files.
   *
   * @default true
   */
  serverLoad?: boolean;
};

type AutoInstrumentPluginOptions = AutoInstrumentSelection & {
  debug: boolean;
};

/**
 * Creates a Vite plugin that automatically instruments the parts of the app
 * specified in @param options. This includes
 *
 * - universal `load` functions from `+page.(js|ts)` and `+layout.(js|ts)` files
 * - server-only `load` functions from `+page.server.(js|ts)` and `+layout.server.(js|ts)` files
 *
 * @returns the plugin
 */
export function makeAutoInstrumentationPlugin(options: AutoInstrumentPluginOptions): Plugin {
  const { load: shouldWrapLoad, serverLoad: shouldWrapServerLoad, debug } = options;

  return {
    name: 'sentry-auto-instrumentation',
    // This plugin needs to run as early as possible, before the SvelteKit plugin virtualizes all paths and ids
    enforce: 'pre',

    async load(id) {
      const applyUniversalLoadWrapper =
        shouldWrapLoad &&
        /^\+(page|layout)\.(js|ts|mjs|mts)$/.test(path.basename(id)) &&
        (await canWrapLoad(id, debug));

      if (applyUniversalLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${id} with Sentry load wrapper`);
        return getWrapperCode('wrapLoadWithSentry', `${id}${WRAPPED_MODULE_SUFFIX}`);
      }

      const applyServerLoadWrapper =
        shouldWrapServerLoad &&
        /^\+(page|layout)\.server\.(js|ts|mjs|mts)$/.test(path.basename(id)) &&
        (await canWrapLoad(id, debug));

      if (applyServerLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${id} with Sentry load wrapper`);
        return getWrapperCode('wrapServerLoadWithSentry', `${id}${WRAPPED_MODULE_SUFFIX}`);
      }

      return null;
    },
  };
}

/**
 * We only want to apply our wrapper to files that
 *
 *  - Have no Sentry code yet in them. This is to avoid double-wrapping or interferance with custom
 *    Sentry calls.
 *  - Actually declare a `load` function. The second check of course is not 100% accurate, but it's good enough.
 *    Injecting our wrapper into files that don't declare a `load` function would result in a build-time warning
 *    because vite/rollup warns if we reference an export from the user's file in our wrapping code that
 *    doesn't exist.
 *
 * Exported for testing
 *
 * @returns `true` if we can wrap the given file, `false` otherwise
 */
export async function canWrapLoad(id: string, debug: boolean): Promise<boolean> {
  const code = (await fs.promises.readFile(id, 'utf8')).toString();

  const codeWithoutComments = code.replace(/(\/\/.*| ?\/\*[^]*?\*\/)(,?)$/gm, '');

  const hasSentryContent = codeWithoutComments.includes('@sentry/sveltekit');
  if (hasSentryContent) {
    // eslint-disable-next-line no-console
    debug && console.log(`Skipping wrapping ${id} because it already contains Sentry code`);
  }

  const hasLoadDeclaration = /((const|let|var|function)\s+load\s*(=|\(|:))|as\s+load\s*(,|})/gm.test(
    codeWithoutComments,
  );
  if (!hasLoadDeclaration) {
    // eslint-disable-next-line no-console
    debug && console.log(`Skipping wrapping ${id} because it doesn't declare a \`load\` function`);
  }

  return !hasSentryContent && hasLoadDeclaration;
}

/**
 * Return wrapper code fo the given module id and wrapping function
 */
function getWrapperCode(
  wrapperFunction: 'wrapLoadWithSentry' | 'wrapServerLoadWithSentry',
  idWithSuffix: string,
): string {
  return (
    `import { ${wrapperFunction} } from "@sentry/sveltekit";` +
    `import * as userModule from ${JSON.stringify(idWithSuffix)};` +
    `export const load = userModule.load ? ${wrapperFunction}(userModule.load) : undefined;` +
    `export * from ${JSON.stringify(idWithSuffix)};`
  );
}
