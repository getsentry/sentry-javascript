import type { ExportedHandler, ExportedHandlerFetchHandler } from '@cloudflare/workers-types';
import type { Options } from '@sentry/types';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import { wrapRequestHandler } from './request';

/**
 * Extract environment generic from exported handler.
 */
type ExtractEnv<P> = P extends ExportedHandler<infer Env> ? Env : never;

/**
 * Wrapper for Cloudflare handlers.
 *
 * Initializes the SDK and wraps the handler with Sentry instrumentation.
 *
 * Automatically instruments the `fetch` method of the handler.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param handler {ExportedHandler} The handler to wrap.
 * @returns The wrapped handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentry<E extends ExportedHandler<any>>(
  optionsCallback: (env: ExtractEnv<E>) => Options,
  handler: E,
): E {
  setAsyncLocalStorageAsyncContextStrategy();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  if ('fetch' in handler && typeof handler.fetch === 'function' && !(handler.fetch as any).__SENTRY_INSTRUMENTED__) {
    handler.fetch = new Proxy(handler.fetch, {
      apply(target, thisArg, args: Parameters<ExportedHandlerFetchHandler<ExtractEnv<E>>>) {
        const [request, env, context] = args;
        const options = optionsCallback(env);
        return wrapRequestHandler({ options, request, context }, () => target.apply(thisArg, args));
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (handler.fetch as any).__SENTRY_INSTRUMENTED__ = true;
  }

  return handler;
}
