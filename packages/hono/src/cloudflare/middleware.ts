import { withSentry } from '@sentry/cloudflare';
import { applySdkMetadata, type BaseTransportOptions, debug, type Options } from '@sentry/core';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';

export interface HonoOptions extends Options<BaseTransportOptions> {
  context?: Context;
}

export const sentry = (app: Hono, options: HonoOptions | undefined = {}): MiddlewareHandler => {
  const isDebug = options.debug;

  isDebug && debug.log('Initialized Sentry Hono middleware (Cloudflare)');

  applySdkMetadata(options, 'hono');

  withSentry(() => options, app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
};
