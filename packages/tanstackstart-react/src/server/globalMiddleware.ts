import {
  addNonEnumerableProperty,
  captureException,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  spanToJSON,
  updateSpanName,
} from '@sentry/core';
import type { SentryGlobalFunctionMiddleware, SentryGlobalRequestMiddleware } from '../common/types';
import { SENTRY_INTERNAL } from './middleware';
import {
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  SENTRY_DESCRIPTION,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';

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
    if (activeSpan && spanData?.attributes[SENTRY_ORIGIN] === 'auto.function.tanstackstart.server') {
      if (serverFnMeta?.name) {
        // Read off the attribute rather than the span name, which is low cardinality with span streaming.
        const method = (spanData.attributes[HTTP_REQUEST_METHOD] as string | undefined) || 'GET';
        const description = `${method} /_serverFn/${serverFnMeta.name}`;
        const client = getClient();
        const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

        // With span streaming, a `function` span is named after the function it wraps.
        updateSpanName(activeSpan, hasSpanStreaming ? serverFnMeta.name : description);
        if (hasSpanStreaming) {
          // Relay infers a `function` span's description from `code.function.name` alone.
          activeSpan.setAttributes({
            [CODE_FUNCTION_NAME]: serverFnMeta.name,
            [SENTRY_DESCRIPTION]: description,
          });
        }
        activeSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');
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
export const sentryGlobalRequestMiddleware: SentryGlobalRequestMiddleware = {
  // `~types`/`_types` only exist on the type level in TanStack Start middlewares and hold no runtime value
  '~types': undefined as unknown as SentryGlobalRequestMiddleware['~types'],
  _types: undefined as unknown as SentryGlobalRequestMiddleware['_types'],

  options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: createSentryMiddlewareHandler('auto.middleware.tanstackstart.request') as (...args: any[]) => any,
  },
};

/**
 * Global function middleware that captures errors from server function invocations.
 * Should be added as the first entry in the `functionMiddleware` array of `createStart()`.
 */
export const sentryGlobalFunctionMiddleware: SentryGlobalFunctionMiddleware = {
  // `~types`/`_types` only exist on the type level in TanStack Start middlewares and hold no runtime value
  '~types': undefined as unknown as SentryGlobalFunctionMiddleware['~types'],
  _types: undefined as unknown as SentryGlobalFunctionMiddleware['_types'],

  options: {
    server: createSentryFunctionMiddlewareHandler('auto.middleware.tanstackstart.server_function') as (
      ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  },
};

// Mark as internal so the Vite auto-instrumentation plugin skips these middleware
addNonEnumerableProperty(sentryGlobalRequestMiddleware, SENTRY_INTERNAL, true);
addNonEnumerableProperty(sentryGlobalFunctionMiddleware, SENTRY_INTERNAL, true);
