import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addNonEnumerableProperty,
  captureException,
  getActiveSpan,
  spanToJSON,
  updateSpanName,
} from '@sentry/core';
import type { TanStackMiddlewareBase } from '../common/types';
import { SENTRY_INTERNAL } from './middleware';

type ServerFnMeta = {
  id?: string;
  name?: string;
  filename?: string;
};

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

function createSentryFunctionMiddlewareHandler(mechanismType: string) {
  return async function sentryFunctionMiddlewareHandler({
    next,
    serverFnMeta,
  }: {
    next: () => Promise<unknown>;
    serverFnMeta?: ServerFnMeta;
  }): Promise<unknown> {
    const activeSpan = getActiveSpan();
    const spanData = activeSpan ? spanToJSON(activeSpan) : undefined;
    if (activeSpan && spanData?.op === 'function.tanstackstart') {
      if (serverFnMeta?.name) {
        const method = spanData.description?.split(' ')[0] || 'GET';
        updateSpanName(activeSpan, `${method} /_serverFn/${serverFnMeta.name}`);
        activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      }
      if (serverFnMeta?.id) {
        activeSpan.setAttribute('tanstackstart.function.id', serverFnMeta.id);
      }
      if (serverFnMeta?.filename) {
        activeSpan.setAttribute('tanstackstart.function.filename', serverFnMeta.filename);
      }
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: createSentryMiddlewareHandler('auto.middleware.tanstackstart.request') as (...args: any[]) => any,
  },
};

/**
 * Global function middleware that captures errors from server function invocations.
 * Should be added as the first entry in the `functionMiddleware` array of `createStart()`.
 */
export const sentryGlobalFunctionMiddleware: TanStackMiddlewareBase = {
  '~types': undefined,

  options: {
    server: createSentryFunctionMiddlewareHandler('auto.middleware.tanstackstart.server_function') as (
      ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  },
};

// Mark as internal so the Vite auto-instrumentation plugin skips these middleware
addNonEnumerableProperty(sentryGlobalRequestMiddleware, SENTRY_INTERNAL, true);
addNonEnumerableProperty(sentryGlobalFunctionMiddleware, SENTRY_INTERNAL, true);
