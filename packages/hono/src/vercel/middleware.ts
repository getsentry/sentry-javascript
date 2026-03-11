import {
  applySdkMetadata,
  type BaseTransportOptions,
  captureException,
  continueTrace,
  debug,
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  type Options,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
  updateSpanName,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { patchAppUse } from '../shared/patchAppUse';
import { hasFetchEvent } from '../utils/hono-context';

export interface HonoOptions extends Options<BaseTransportOptions> {
  context?: Context;
}

/**
 * Sentry middleware for Hono running on Vercel serverless functions.
 *
 * Initialises the Sentry Node SDK (if not already initialised) and wraps every
 * incoming request in an isolation scope with an HTTP server span.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { sentry } from '@sentry/hono/vercel';
 *
 * const app = new Hono();
 *
 * app.use('*', sentry(app, {
 *   dsn: '__DSN__',
 *   tracesSampleRate: 1.0,
 * }));
 *
 * app.get('/', (c) => c.text('Hello!'));
 *
 * export default app;
 * ```
 */
export const sentry = (app: Hono, options: HonoOptions | undefined = {}): MiddlewareHandler => {
  const isDebug = options.debug;

  isDebug && debug.log('Initialized Sentry Hono middleware (Vercel)');

  applySdkMetadata(options, 'hono');

  initNode(options);

  patchAppUse(app);

  return async (context, next) => {
    const req = hasFetchEvent(context) ? context.event.request : context.req.raw;
    const method = context.req.method;
    const path = context.req.path;

    return withIsolationScope(isolationScope => {
      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: winterCGRequestToRequestData(req),
      });

      const headers: Record<string, string> = {};
      req.headers.forEach((value: string, key: string) => {
        headers[key] = value;
      });

      return continueTrace(
        {
          sentryTrace: headers['sentry-trace'] || '',
          baggage: headers['baggage'],
        },
        () => {
          return startSpan(
            {
              name: `${method} ${path}`,
              op: 'http.server',
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.hono',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                'http.request.method': method,
                'url.path': path,
              },
            },
            async span => {
              try {
                await next();

                // After the handler runs, update the span name with the matched route
                const route = routePath(context);
                const spanName = `${method} ${route}`;

                span.updateName(spanName);
                span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
                updateSpanName(getRootSpan(span), spanName);
                getIsolationScope().setTransactionName(spanName);

                setHttpStatus(span, context.res.status);
              } catch (error) {
                captureException(error, {
                  mechanism: { handled: false, type: 'auto.http.hono' },
                });
                throw error;
              } finally {
                // Also capture errors stored on the context (e.g. from Hono's onError handler)
                if (context.error) {
                  captureException(context.error, {
                    mechanism: { handled: false, type: 'auto.faas.hono.error_handler' },
                  });
                }
              }
            },
          );
        },
      );
    });
  };
};
