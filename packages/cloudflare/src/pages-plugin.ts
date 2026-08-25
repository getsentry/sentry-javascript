import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import type { CloudflareOptions } from './client';
import type { ExecutionContextCompat } from './executionContext';
import { wrapRequestHandlerWithInit } from './wrapRequestHandlerWithInit';
import { init } from './sdk';
import type { StrictCloudflareOptions } from './types';

/**
 * Plugin middleware for Cloudflare Pages.
 *
 * Initializes the SDK and wraps cloudflare pages requests with SDK instrumentation.
 *
 * @example Simple usage
 *
 * ```javascript
 * // functions/_middleware.js
 * import * as Sentry from '@sentry/cloudflare';
 *
 * export const onRequest = Sentry.sentryPagesPlugin({
 *   dsn: process.env.SENTRY_DSN,
 *   tracesSampleRate: 1.0,
 * });
 * ```
 *
 * @example Usage with handler function to access context for environmental variables
 *
 * ```javascript
 * import * as Sentry from '@sentry/cloudflare';
 *
 * const const onRequest = Sentry.sentryPagesPlugin((context) => ({
 *   dsn: context.env.SENTRY_DSN,
 *   tracesSampleRate: 1.0,
 * })
 * ```
 *
 * @param handlerOrOptions Configuration options or a function that returns configuration options.
 * @returns A plugin function that can be used in Cloudflare Pages.
 */
// Overloads rather than a union parameter: TypeScript does not infer `O` out of a union member,
// so a union signature falls back to the default and the unknown-key check never runs. The object
// overload stays on plain `CloudflareOptions` — a direct object literal is still excess property
// checked, and a callback cannot match it.
export function sentryPagesPlugin<
  // oxlint-disable-next-line typescript/no-explicit-any
  Env = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PluginParams = any,
  O = unknown,
>(
  handler: (context: EventPluginContext<Env, Params, Data, PluginParams>) => StrictCloudflareOptions<O>,
): PagesPluginFunction<Env, Params, Data, PluginParams>;
export function sentryPagesPlugin<
  // oxlint-disable-next-line typescript/no-explicit-any
  Env = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PluginParams = any,
>(options: CloudflareOptions): PagesPluginFunction<Env, Params, Data, PluginParams>;
export function sentryPagesPlugin<
  // oxlint-disable-next-line typescript/no-explicit-any
  Env = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
  // Although it is not ideal to use `any` here, it makes usage more flexible for different setups.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PluginParams = any,
>(
  handlerOrOptions:
    | CloudflareOptions
    | ((context: EventPluginContext<Env, Params, Data, PluginParams>) => CloudflareOptions),
): PagesPluginFunction<Env, Params, Data, PluginParams> {
  setAsyncLocalStorageAsyncContextStrategy();
  return context => {
    if (context.request.method === 'OPTIONS' || context.request.method === 'HEAD') {
      return context.next();
    }

    const options = typeof handlerOrOptions === 'function' ? handlerOrOptions(context) : handlerOrOptions;
    // A Pages `EventPluginContext` is not a Workers `ExecutionContext`, but `wrapRequestHandler` only
    // uses `waitUntil` and a `'storage' in context` check, both of which this satisfies.
    const executionContext = { ...context, props: {} } as unknown as ExecutionContextCompat;
    return wrapRequestHandlerWithInit(
      { options, request: context.request, context: executionContext },
      () => context.next(),
      init,
    );
  };
}
