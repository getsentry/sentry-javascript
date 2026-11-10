import { debug } from '@sentry/core';
import type { DenoOptions } from '@sentry/deno';
import { init } from './sdk';
import {
  applyHonoPatches,
  createHonoRequestMiddleware,
  type SentryHonoMiddlewareOptions,
} from '@sentry/server-utils/no-diagnostic-channels';
import type { Env, Hono, MiddlewareHandler } from 'hono';

export interface HonoDenoOptions extends DenoOptions, SentryHonoMiddlewareOptions {}

/**
 * Sentry middleware for Hono running in a Deno runtime environment.
 */
export const sentry = <E extends Env>(app: Hono<E>, options: HonoDenoOptions): MiddlewareHandler => {
  options.debug && debug.log('Initialized Sentry Hono middleware (Deno)');

  init(options);

  applyHonoPatches(app);

  return createHonoRequestMiddleware({ runtime: 'deno', shouldHandleError: options.shouldHandleError });
};
