import { addNonEnumerableProperty, captureException } from '@sentry/core';
import type { TanStackMiddlewareBase } from '../common/types';
import { SENTRY_INTERNAL } from './middleware';

async function sentryMiddlewareHandler({ next }: { next: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await next();
  } catch (e) {
    captureException(e, {
      mechanism: { type: 'auto.function.tanstackstart', handled: false },
    });
    throw e;
  }
}

/**
 * Global request middleware that captures errors from all HTTP requests (page loads, API routes, and server function requests).
 * Should be added as the first entry in the `requestMiddleware` array of `createStart()`.
 */
export const sentryGlobalRequestMiddleware: TanStackMiddlewareBase = {
  options: { server: sentryMiddlewareHandler as (...args: unknown[]) => unknown },
};

/**
 * Global function middleware that captures errors from all server function invocations.
 * Should be added as the first entry in the `functionMiddleware` array of `createStart()`.
 */
export const sentryGlobalFunctionMiddleware: TanStackMiddlewareBase = {
  options: { server: sentryMiddlewareHandler as (...args: unknown[]) => unknown },
};

// Mark as internal so the Vite auto-instrumentation plugin skips these middleware
addNonEnumerableProperty(
  sentryGlobalRequestMiddleware as unknown as Record<string, unknown>,
  SENTRY_INTERNAL,
  true,
);
addNonEnumerableProperty(
  sentryGlobalFunctionMiddleware as unknown as Record<string, unknown>,
  SENTRY_INTERNAL,
  true,
);
