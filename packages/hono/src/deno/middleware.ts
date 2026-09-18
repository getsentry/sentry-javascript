import { type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init } from './sdk';
import { getConnInfo } from 'hono/deno';
import { applyHonoPatches, createHonoRequestMiddleware, type SentryHonoMiddlewareOptions } from '@sentry/server-utils';
import type { Env, Hono, MiddlewareHandler } from 'hono';

export interface HonoDenoOptions extends Options<BaseTransportOptions>, SentryHonoMiddlewareOptions {}

/**
 * Sentry middleware for Hono running in a Deno runtime environment.
 */
export const sentry = <E extends Env>(app: Hono<E>, options: HonoDenoOptions): MiddlewareHandler => {
  options.debug && debug.log('Initialized Sentry Hono middleware (Deno)');

  init(options);

  applyHonoPatches(app);

  return createHonoRequestMiddleware({ getConnInfo, shouldHandleError: options.shouldHandleError });
};
