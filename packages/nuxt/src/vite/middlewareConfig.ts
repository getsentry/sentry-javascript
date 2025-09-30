import { addServerImports, createResolver } from '@nuxt/kit';
import type { Nitro } from 'nitropack/types';
import * as path from 'path';
import type { InputPluginOption } from 'rollup';

/**
 * Adds a server import for the middleware instrumentation.
 */
export function addMiddlewareImports(): void {
  addServerImports([
    {
      name: 'wrapMiddlewareHandlerWithSentry',
      from: createResolver(import.meta.url).resolve('./runtime/hooks/wrapMiddlewareHandler'),
    },
  ]);
}

/**
 * Adds middleware instrumentation to the Nitro build.
 *
 * @param nitro Nitro instance
 */
export function addMiddlewareInstrumentation(nitro: Nitro): void {
  nitro.hooks.hook('rollup:before', (nitro, rollupConfig) => {
    if (!rollupConfig.plugins) {
      rollupConfig.plugins = [];
    }

    if (!Array.isArray(rollupConfig.plugins)) {
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.push(middlewareInstrumentationPlugin(nitro));
  });
}

/**
 * Creates a rollup plugin for the middleware instrumentation by transforming the middleware code.
 *
 * @param nitro Nitro instance
 * @returns The rollup plugin for the middleware instrumentation.
 */
function middlewareInstrumentationPlugin(nitro: Nitro): InputPluginOption {
  const middlewareFiles = new Set<string>();

  return {
    name: 'sentry-nuxt-middleware-instrumentation',
    buildStart() {
      // Collect middleware files during build start
      nitro.scannedHandlers?.forEach(({ middleware, handler }) => {
        if (middleware && handler) {
          middlewareFiles.add(handler);
        }
      });
    },
    transform(code: string, id: string) {
      // Only transform files we've identified as middleware
      if (middlewareFiles.has(id)) {
        const fileName = path.basename(id);
        return {
          code: wrapMiddlewareCode(code, fileName),
          map: null,
        };
      }
      return null;
    },
  };
}

/**
 * Wraps the middleware user code to instrument it.
 *
 * @param originalCode The original user code of the middleware.
 * @param fileName The name of the middleware file, used for the span name and logging.
 *
 * @returns The wrapped user code of the middleware.
 */
function wrapMiddlewareCode(originalCode: string, fileName: string): string {
  // Remove common file extensions
  const cleanFileName = fileName.replace(/\.(ts|js|mjs|mts|cts)$/, '');

  return `
import { wrapMiddlewareHandlerWithSentry } from '#imports';

function defineInstrumentedEventHandler(handlerOrObject) {
  return defineEventHandler(wrapMiddlewareHandlerWithSentry(handlerOrObject, '${cleanFileName}'));
}

function instrumentedEventHandler(handlerOrObject) {
  return eventHandler(wrapMiddlewareHandlerWithSentry(handlerOrObject, '${cleanFileName}'));
}

${originalCode
  .replace(/defineEventHandler\(/g, 'defineInstrumentedEventHandler(')
  .replace(/eventHandler\(/g, 'instrumentedEventHandler(')}
`;
}
