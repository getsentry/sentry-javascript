import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { wrapRequestHandler } from './request';

/**
 * Plugin middleware for Cloudflare Pages.
 *
 * Initializes the SDK and wraps cloudflare pages requests with SDK instrumentation.
 *
 * @example
 * ```javascript
 * // functions/_middleware.js
 * import * as Sentry from '@sentry/cloudflare';
 *
 * export const onRequest = Sentry.sentryPagesPlugin({
 *  dsn: process.env.SENTRY_DSN,
 *  tracesSampleRate: 1.0,
 * });
 * ```
 */
export function sentryPagesPlugin<
  Env = unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
>(options: CloudflareOptions): PagesPluginFunction<Env, Params, Data, CloudflareOptions> {
  setAsyncLocalStorageAsyncContextStrategy();
  return context => wrapRequestHandler({ options, request: context.request, context }, () => context.next());
}
