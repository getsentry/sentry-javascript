import { withSentry } from '@sentry/cloudflare';
import {
  type BaseTransportOptions,
  continueTrace,
  debug,
  getActiveSpan,
  getClient,
  getRootSpan,
  type Options,
  updateSpanName,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { hasFetchEvent } from '../utils/hono-context';

export interface HonoOptions extends Options<BaseTransportOptions> {
  context?: Context;
}

export const sentry = (
  app: Hono,
  options: HonoOptions | undefined = {},
  // callback?: (sentry: Toucan) => void,
): MiddlewareHandler => {
  const isDebug = options.debug;
  isDebug && debug.log('- - - - - - - - call sentry middleware - - - - - - - - - -');

  withSentry(() => options, app);

  return async (context, next) => {
    isDebug && debug.log('- - - - - - - - - - -  new request - - - - - - - - - - -');

    return withIsolationScope(async isolationScope =>
      continueTrace(
        {
          sentryTrace: context.req.raw.headers.get('sentry-trace') ?? '',
          baggage: context.req.raw.headers.get('baggage'),
        },
        async () => {
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: winterCGRequestToRequestData(
              hasFetchEvent(context) ? context.event.request : context.req.raw,
            ),
          });

          await next(); // Handler runs in between. Before is Request ⤴ and afterward is Response ⤵

          const activeSpan = getActiveSpan();
          if (activeSpan) {
            activeSpan.updateName(`${context.req.method} ${routePath(context)}`);
            updateSpanName(getRootSpan(activeSpan), `${context.req.method} ${routePath(context)}`);
          }

          isolationScope.setTransactionName(`${context.req.method} ${routePath(context)}`);

          if (context.error) {
            isDebug && debug.log('captureException...');
            getClient()?.captureException(context.error);
          }
        },
      ),
    );
  };
};
