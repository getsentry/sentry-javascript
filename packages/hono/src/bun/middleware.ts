import type { BunOptions } from '@sentry/bun';
import { debug } from '@sentry/core';
import { init } from './sdk';
import { applyHonoPatches, createHonoRequestMiddleware, type SentryHonoMiddlewareOptions } from '@sentry/server-utils';
import type { Env, Hono, MiddlewareHandler } from 'hono';

export interface HonoBunOptions extends BunOptions, SentryHonoMiddlewareOptions {}

/**
 * Sentry middleware for Hono running in a Bun runtime environment.
 */
export const sentry = <E extends Env>(app: Hono<E>, options: HonoBunOptions): MiddlewareHandler => {
  options.debug && debug.log('Initialized Sentry Hono middleware (Bun)');

  init(options);

  applyHonoPatches(app);

  return createHonoRequestMiddleware({ runtime: 'bun', shouldHandleError: options.shouldHandleError });
};
