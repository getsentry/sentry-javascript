/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import * as fs from 'fs';
import * as path from 'path';
import type { SourceMap } from 'rollup';
import { rollup } from 'rollup';
import type { Plugin } from 'vite';

// Just a simple placeholder to make referencing module consistent
const SENTRY_WRAPPER_MODULE_NAME = 'sentry-wrapper-module';

// Needs to end in .cjs in order for the `commonjs` plugin to pick it up
const WRAPPING_TARGET_MODULE_NAME = '__SENTRY_WRAPPING_TARGET_FILE__.js';

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
 * specified in @param options
 *
 * @returns the plugin
 */
export async function makeAutoInstrumentationPlugin(options: AutoInstrumentPluginOptions): Promise<Plugin> {
  const universalLoadTemplatePath = path.resolve(__dirname, 'templates', 'universalLoadTemplate.js');
  const universalLoadTemplate = (await fs.promises.readFile(universalLoadTemplatePath, 'utf-8')).toString();

  const serverLoadTemplatePath = path.resolve(__dirname, 'templates', 'serverLoadTemplate.js');
  const serverLoadTemplate = (await fs.promises.readFile(serverLoadTemplatePath, 'utf-8')).toString();

  const universalLoadWrappingCode = universalLoadTemplate.replace(
    /__SENTRY_WRAPPING_TARGET_FILE__/g,
    WRAPPING_TARGET_MODULE_NAME,
  );
  const serverLoadWrappingCode = serverLoadTemplate.replace(
    /__SENTRY_WRAPPING_TARGET_FILE__/g,
    WRAPPING_TARGET_MODULE_NAME,
  );

  const { load: shouldWrapLoad, serverLoad: shouldWrapServerLoad, debug } = options;

  return {
    name: 'sentry-auto-instrumentation',
    enforce: 'post',
    async transform(userCode, id) {
      const shouldApplyUniversalLoadWrapper =
        shouldWrapLoad &&
        /\+(page|layout)\.(js|ts|mjs|mts)$/.test(id) &&
        // Simple check to see if users already instrumented the file manually
        !userCode.includes('@sentry/sveltekit');

      if (shouldApplyUniversalLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log('[Sentry] Applying universal load wrapper to', id);
        return await wrapUserCode(universalLoadWrappingCode, userCode);
      }

      const shouldApplyServerLoadWrapper =
        shouldWrapServerLoad &&
        /\+(page|layout)\.server\.(js|ts|mjs|mts)$/.test(id) &&
        !userCode.includes('@sentry/sveltekit');

      if (shouldApplyServerLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log('[Sentry] Applying server load wrapper to', id);
        return await wrapUserCode(serverLoadWrappingCode, userCode);
      }

      return null;
    },
  };
}

/**
 * Uses rollup to bundle the wrapper code and the user code together, so that we can use rollup's source map support.
 * This works analogously to our NextJS wrapping solution.
 * The one exception is that we don't pass in any source map. This is because generating the userCode's
 * source map generally works but it breaks SvelteKit's source map generation for some reason.
 * Not passing a map actually works and things are still mapped correctly in the end.
 * No Sentry code is visible in the final source map.
 * @see {@link file:///./../../../nextjs/src/config/loaders/wrappingLoader.ts} for more details.
 */
async function wrapUserCode(
  wrapperCode: string,
  userModuleCode: string,
): Promise<{ code: string; map?: SourceMap | null }> {
  const rollupBuild = await rollup({
    input: SENTRY_WRAPPER_MODULE_NAME,

    plugins: [
      {
        name: 'virtualize-sentry-wrapper-modules',
        resolveId: id => {
          if (id === SENTRY_WRAPPER_MODULE_NAME || id === WRAPPING_TARGET_MODULE_NAME) {
            return id;
          } else {
            return null;
          }
        },
        load(id) {
          if (id === SENTRY_WRAPPER_MODULE_NAME) {
            return wrapperCode;
          } else if (id === WRAPPING_TARGET_MODULE_NAME) {
            return {
              code: userModuleCode,
              // map: userModuleSourceMap,
            };
          } else {
            return null;
          }
        },
      },
    ],

    external: sourceId => sourceId !== SENTRY_WRAPPER_MODULE_NAME && sourceId !== WRAPPING_TARGET_MODULE_NAME,

    context: 'this',

    makeAbsoluteExternalsRelative: false,

    onwarn: (_warning, _warn) => {
      // Suppress all warnings - we don't want to bother people with this output
      // _warn(_warning); // uncomment to debug
    },
  });

  const finalBundle = await rollupBuild.generate({
    format: 'esm',
    sourcemap: 'hidden',
  });

  return finalBundle.output[0];
}
