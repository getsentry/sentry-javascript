import type {
  ExportedHandler,
  ExportedHandlerFetchHandler,
  ExportedHandlerScheduledHandler,
} from '@cloudflare/workers-types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  flush,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { wrapRequestHandler } from './request';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';

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
export function withSentry<Env = unknown, QueueHandlerMessage = unknown, CfHostMetadata = unknown>(
  optionsCallback: (env: Env) => CloudflareOptions,
  handler: ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata>,
): ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata> {
  setAsyncLocalStorageAsyncContextStrategy();

  if ('fetch' in handler && typeof handler.fetch === 'function' && !isInstrumented(handler.fetch)) {
    handler.fetch = new Proxy(handler.fetch, {
      apply(target, thisArg, args: Parameters<ExportedHandlerFetchHandler<Env, CfHostMetadata>>) {
        const [request, env, context] = args;
        const options = optionsCallback(env);
        return wrapRequestHandler({ options, request, context }, () => target.apply(thisArg, args));
      },
    });

    markAsInstrumented(handler.fetch);
  }

  if ('scheduled' in handler && typeof handler.scheduled === 'function' && !isInstrumented(handler.scheduled)) {
    handler.scheduled = new Proxy(handler.scheduled, {
      apply(target, thisArg, args: Parameters<ExportedHandlerScheduledHandler<Env>>) {
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
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
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

    markAsInstrumented(handler.scheduled);
  }

  return handler;
}

type SentryInstrumented<T> = T & {
  __SENTRY_INSTRUMENTED__?: boolean;
};

function markAsInstrumented<T>(handler: T): void {
  try {
    (handler as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__ = true;
  } catch {
    // ignore errors here
  }
}

function isInstrumented<T>(handler: T): boolean | undefined {
  try {
    return (handler as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__;
  } catch {
    return false;
  }
}
