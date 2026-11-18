import {
  addNonEnumerableProperty,
  captureException,
  getClient,
  hasSpanStreamingEnabled,
  startSpan,
} from '@sentry/core';
import type { SentryGlobalFunctionMiddleware, SentryGlobalRequestMiddleware } from '../common/types';
import { SENTRY_INTERNAL } from './middleware';
import {
  CODE_FILE_PATH,
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';

type ServerFnMeta = {
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
  return function sentryFunctionMiddlewareHandler({
    next,
    serverFnMeta,
    method = 'GET',
  }: {
    next: () => Promise<unknown>;
    serverFnMeta?: ServerFnMeta;
    method?: string;
  }): Promise<unknown> {
    const functionName = serverFnMeta?.name || 'serverFn';
    const description = `${method} /_serverFn/${functionName}`;
    const client = getClient();
    const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

    return startSpan(
      {
        // With span streaming, a `function` span is named after the function it wraps.
        name: hasSpanStreaming ? functionName : description,
        attributes: {
          [SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
          [SENTRY_OP]: FUNCTION,
          [CODE_FUNCTION_NAME]: functionName,
          [HTTP_REQUEST_METHOD]: method,
          // Relay infers a `function` span's description from `code.function.name` alone, which drops the path.
          ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: description }),
          ...(serverFnMeta?.filename && { [CODE_FILE_PATH]: serverFnMeta.filename }),
        },
      },
      async () => {
        try {
          return await next();
        } catch (e) {
          captureException(e, {
            mechanism: { type: mechanismType, handled: false },
          });
          throw e;
        }
      },
    );
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
 * Global function middleware that creates a span for each server function invocation and captures its errors.
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
