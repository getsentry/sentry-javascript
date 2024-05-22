import * as mod from 'node:module';
import { GLOBAL_OBJ, consoleSandbox, logger } from '@sentry/utils';
import { NODE_MAJOR, NODE_MINOR } from '../nodeVersion';

declare const __IMPORT_META_URL_REPLACEMENT__: string;

/**
 * Registers hooks for ESM modules.
 *
 * The first hook overrides the source code of 'import-in-the-middle/hook.mjs' so it only instruments pre-specified modules.
 */
export function registerEsmModuleHooks(modulesToInstrument: string[]): void {
  // Register hook was added in v20.6.0 and v18.19.0
  if (NODE_MAJOR >= 22 || (NODE_MAJOR === 20 && NODE_MINOR >= 6) || (NODE_MAJOR === 18 && NODE_MINOR >= 19)) {
    // We need to work around using import.meta.url directly because jest complains about it.
    const importMetaUrl =
      typeof __IMPORT_META_URL_REPLACEMENT__ !== 'undefined' ? __IMPORT_META_URL_REPLACEMENT__ : undefined;

    if (!importMetaUrl || GLOBAL_OBJ._sentryEsmLoaderHookRegistered) {
      return;
    }

    try {
      const iitmOverrideCode = `
    import { createHook } from "./hook.js";

    const { load, resolve: resolveIITM, getFormat, getSource } = createHook(import.meta);

    const modulesToInstrument = ${JSON.stringify(modulesToInstrument)};

    export async function resolve(specifier, context, nextResolve) {
        if (modulesToInstrument.includes(specifier)) {
            return resolveIITM(specifier, context, nextResolve);
        }

        return nextResolve(specifier, context);
    }

    export { load, getFormat, getSource };`;

      // This loader overrides the source code of 'import-in-the-middle/hook.mjs' with
      // the above code. This code ensures that only the specified modules are proxied.
      // @ts-expect-error register is available in these versions
      mod.register(
        new URL(
          `data:application/javascript,
        export async function load(url, context, nextLoad) {
            if (url.endsWith('import-in-the-middle/hook.mjs')) {
                const result = await nextLoad(url, context);
                return {...result, source: '${iitmOverrideCode}' };
            }
            return nextLoad(url, context);
        }`,
        ),
        importMetaUrl,
      );

      // @ts-expect-error register is available in these versions
      mod.register('@opentelemetry/instrumentation/hook.mjs', importMetaUrl);

      GLOBAL_OBJ._sentryEsmLoaderHookRegistered = true;
    } catch (error) {
      logger.warn('Failed to register ESM hook', error);
    }
  } else {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] You are using Node.js in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or use version 7.x of the Sentry Node.js SDK.',
      );
    });
  }
}
