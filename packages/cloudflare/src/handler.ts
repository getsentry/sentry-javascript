import type {
  ExportedHandler,
  ExportedHandlerFetchHandler,
  ExportedHandlerScheduledHandler,
} from '@cloudflare/workers-types';
import { captureException, flush, startSpan, withIsolationScope } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { wrapRequestHandler } from './request';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';

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
  optionsCallback: (env: ExtractEnv<E>) => CloudflareOptions,
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

  if (
    'scheduled' in handler &&
    typeof handler.scheduled === 'function' &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    !(handler.scheduled as any).__SENTRY_INSTRUMENTED__
  ) {
    handler.scheduled = new Proxy(handler.scheduled, {
      apply(target, thisArg, args: Parameters<ExportedHandlerScheduledHandler<ExtractEnv<E>>>) {
        const [event, env, context] = args;
        return withIsolationScope(isolationScope => {
          const options = optionsCallback(env);
          const client = init(options);
          isolationScope.setClient(client);

          addCloudResourceContext(isolationScope);

          return startSpan(
            {
              op: 'faas.cron',
              name: `Scheduled Cron ${event.cron}`,
              attributes: {
                'faas.cron': event.cron,
                'faas.time': new Date(event.scheduledTime).toISOString(),
                'faas.trigger': 'timer',
              },
            },
            async () => {
              try {
                return await (target.apply(thisArg, args) as ReturnType<typeof target>);
              } catch (e) {
                captureException(e, { mechanism: { handled: false, type: 'cloudflare' } });
                throw e;
              } finally {
                context.waitUntil(flush(2000));
              }
            },
          );
        });
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (handler.scheduled as any).__SENTRY_INSTRUMENTED__ = true;
  }

  return handler;
}
