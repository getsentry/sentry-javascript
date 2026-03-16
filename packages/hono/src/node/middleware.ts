import { applySdkMetadata, type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { patchAppUse } from '../shared/patchAppUse';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';

export interface HonoOptions extends Options<BaseTransportOptions> {
  context?: Context;
}

/**
 * Sentry middleware for Hono running in a Node runtime environment.
 */
export const sentry = (app: Hono, options: HonoOptions | undefined = {}): MiddlewareHandler => {
  const isDebug = options.debug;

  isDebug && debug.log('Initialized Sentry Hono middleware (Node)');

  applySdkMetadata(options, 'hono');

  initNode(options);

  patchAppUse(app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context, 'auto.middleware.hono.error_handler');
  };
};
