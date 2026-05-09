import type { CreateRequestHandlerFunction } from '@remix-run/server-runtime';
import { debug, fill, loadModule } from '@sentry/core';
import { createRequire } from 'module';
import { DEBUG_BUILD } from '../utils/debug-build';
import { makeWrappedCreateRequestHandler } from './instrumentServer';

/**
 * Helper to load a module in both CJS and ESM contexts.
 * In ESM, we use createRequire to create a require function.
 * In CJS, we use the standard loadModule.
 */
function loadModuleCompat<T>(moduleName: string): T | undefined {
  // Check if we're in ESM context (module doesn't exist)
  if (typeof module === 'undefined') {
    // ESM context - use createRequire to get a require function
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const require = createRequire(import.meta.url);
      return require(moduleName) as T;
    } catch {
      return undefined;
    }
  } else {
    // CJS context - use loadModule with module reference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return loadModule<T>(moduleName, module as any);
  }
}

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(options?: { instrumentTracing?: boolean }): void {
  const pkg = loadModuleCompat<{
    createRequestHandler: CreateRequestHandlerFunction;
  }>('@remix-run/server-runtime');

  if (!pkg) {
    DEBUG_BUILD && debug.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler(options));
}
