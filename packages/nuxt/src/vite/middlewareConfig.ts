import { addServerImports, createResolver } from '@nuxt/kit';
import type { Nitro } from 'nitropack/types';
import * as path from 'path';
import type { InputPluginOption } from 'rollup';

/**
 * Adds a template for the middleware instrumentation.
 */
export function addMiddlewareImports(): void {
  addServerImports([
    {
      name: 'instrumentMiddlewareHandler',
      from: createResolver(import.meta.url).resolve('./runtime/hooks/instrumentMiddlewareHandler'),
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

function wrapMiddlewareCode(originalCode: string, fileName: string): string {
  return `
import { instrumentMiddlewareHandler } from '#imports';

function defineInstrumentedEventHandler(handlerOrObject) {
  // Handle function syntax
  if (typeof handlerOrObject === 'function') {
    return defineEventHandler(instrumentMiddlewareHandler(handlerOrObject, '${fileName}'));
  }

  // Handle object syntax
  return defineEventHandler({
    ...handlerOrObject,
    handler: instrumentMiddlewareHandler(handlerOrObject.handler, '${fileName}')
  });
}

${originalCode.replace(/defineEventHandler\(/g, 'defineInstrumentedEventHandler(')}
`;
}
