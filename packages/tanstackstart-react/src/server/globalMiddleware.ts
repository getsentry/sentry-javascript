import { addNonEnumerableProperty, captureException } from '@sentry/core';
import type { TanStackMiddlewareBase } from '../common/types';
import { SENTRY_INTERNAL } from './middleware';

function createSentryMiddlewareHandler(mechanismType: string) {
  return async function sentryMiddlewareHandler({ next }: { next: () => Promise<unknown> }): Promise<unknown> {
    try {
      return await next();
    } catch (e) {
      captureException(e, {
        mechanism: { type: mechanismType, handled: false },
      });
      throw e;
    }
  };
}

/**
 * Global request middleware that captures errors from API route requests.
 * Should be added as the first entry in the `requestMiddleware` array of `createStart()`.
 */
export const sentryGlobalRequestMiddleware: TanStackMiddlewareBase = {
  '~types': undefined,
   
  options: {
    server: createSentryMiddlewareHandler('auto.middleware.tanstackstart.request') as (...args: any[]) => any,
  },
};

/**
 * Global function middleware that captures errors from all server function invocations.
 * Should be added as the first entry in the `functionMiddleware` array of `createStart()`.
 */
export const sentryGlobalFunctionMiddleware: TanStackMiddlewareBase = {
  '~types': undefined,
   
  options: {
    server: createSentryMiddlewareHandler('auto.middleware.tanstackstart.server_function') as (...args: any[]) => any,
  },
};

// Mark as internal so the Vite auto-instrumentation plugin skips these middleware
addNonEnumerableProperty(sentryGlobalRequestMiddleware, SENTRY_INTERNAL, true);
addNonEnumerableProperty(sentryGlobalFunctionMiddleware, SENTRY_INTERNAL, true);
