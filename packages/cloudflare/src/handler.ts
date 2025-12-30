import {
  captureException,
  flush,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { isInstrumented, markAsInstrumented } from './instrument';
import { getHonoIntegration } from './integrations/hono';
import { getFinalOptions } from './options';
import { wrapRequestHandler } from './request';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';
import { copyExecutionContext } from './utils/copyExecutionContext';

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
// eslint-disable-next-line complexity
export function withSentry<
  Env = unknown,
  QueueHandlerMessage = unknown,
  CfHostMetadata = unknown,
  T extends ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata> = ExportedHandler<
    Env,
    QueueHandlerMessage,
    CfHostMetadata
  >,
>(optionsCallback: (env: Env) => CloudflareOptions, handler: T): T {
  setAsyncLocalStorageAsyncContextStrategy();

  try {
    if ('fetch' in handler && typeof handler.fetch === 'function' && !isInstrumented(handler.fetch)) {
      handler.fetch = new Proxy(handler.fetch, {
        apply(target, thisArg, args: Parameters<ExportedHandlerFetchHandler<Env, CfHostMetadata>>) {
          const [request, env, ctx] = args;
          const context = copyExecutionContext(ctx);
          args[2] = context;

          const options = getFinalOptions(optionsCallback(env), env);

          return wrapRequestHandler({ options, request, context }, () => target.apply(thisArg, args));
        },
      });

      markAsInstrumented(handler.fetch);
    }

    /* Hono does not reach the catch block of the fetch handler and captureException needs to be called in the hono errorHandler */
    if (
      'onError' in handler &&
      'errorHandler' in handler &&
      typeof handler.errorHandler === 'function' &&
      !isInstrumented(handler.errorHandler)
    ) {
      handler.errorHandler = new Proxy(handler.errorHandler, {
        apply(target, thisArg, args) {
          const [err, context] = args;

          getHonoIntegration()?.handleHonoException(err, context);

          return Reflect.apply(target, thisArg, args);
        },
      });

      markAsInstrumented(handler.errorHandler);
    }

    if ('scheduled' in handler && typeof handler.scheduled === 'function' && !isInstrumented(handler.scheduled)) {
      handler.scheduled = new Proxy(handler.scheduled, {
        apply(target, thisArg, args: Parameters<ExportedHandlerScheduledHandler<Env>>) {
          const [event, env, ctx] = args;
          const context = copyExecutionContext(ctx);
          args[2] = context;

          return withIsolationScope(isolationScope => {
            const options = getFinalOptions(optionsCallback(env), env);
            const waitUntil = context.waitUntil.bind(context);

            const client = init({ ...options, ctx: context });
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
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.scheduled',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                },
              },
              async () => {
                try {
                  return await (target.apply(thisArg, args) as ReturnType<typeof target>);
                } catch (e) {
                  captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.scheduled' } });
                  throw e;
                } finally {
                  waitUntil(flush(2000));
                }
              },
            );
          });
        },
      });

      markAsInstrumented(handler.scheduled);
    }

    if ('email' in handler && typeof handler.email === 'function' && !isInstrumented(handler.email)) {
      handler.email = new Proxy(handler.email, {
        apply(target, thisArg, args: Parameters<EmailExportedHandler<Env>>) {
          const [emailMessage, env, ctx] = args;
          const context = copyExecutionContext(ctx);
          args[2] = context;

          return withIsolationScope(isolationScope => {
            const options = getFinalOptions(optionsCallback(env), env);
            const waitUntil = context.waitUntil.bind(context);

            const client = init({ ...options, ctx: context });
            isolationScope.setClient(client);

            addCloudResourceContext(isolationScope);

            return startSpan(
              {
                op: 'faas.email',
                name: `Handle Email ${emailMessage.to}`,
                attributes: {
                  'faas.trigger': 'email',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.email',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                },
              },
              async () => {
                try {
                  return await (target.apply(thisArg, args) as ReturnType<typeof target>);
                } catch (e) {
                  captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.email' } });
                  throw e;
                } finally {
                  waitUntil(flush(2000));
                }
              },
            );
          });
        },
      });

      markAsInstrumented(handler.email);
    }

    if ('queue' in handler && typeof handler.queue === 'function' && !isInstrumented(handler.queue)) {
      handler.queue = new Proxy(handler.queue, {
        apply(target, thisArg, args: Parameters<ExportedHandlerQueueHandler<Env, QueueHandlerMessage>>) {
          const [batch, env, ctx] = args;
          const context = copyExecutionContext(ctx);
          args[2] = context;

          return withIsolationScope(isolationScope => {
            const options = getFinalOptions(optionsCallback(env), env);
            const waitUntil = context.waitUntil.bind(context);

            const client = init({ ...options, ctx: context });
            isolationScope.setClient(client);

            addCloudResourceContext(isolationScope);

            return startSpan(
              {
                op: 'faas.queue',
                name: `process ${batch.queue}`,
                attributes: {
                  'faas.trigger': 'pubsub',
                  'messaging.destination.name': batch.queue,
                  'messaging.system': 'cloudflare',
                  'messaging.batch.message_count': batch.messages.length,
                  'messaging.message.retry.count': batch.messages.reduce(
                    (acc, message) => acc + message.attempts - 1,
                    0,
                  ),
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.queue',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                },
              },
              async () => {
                try {
                  return await (target.apply(thisArg, args) as ReturnType<typeof target>);
                } catch (e) {
                  captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.queue' } });
                  throw e;
                } finally {
                  waitUntil(flush(2000));
                }
              },
            );
          });
        },
      });

      markAsInstrumented(handler.queue);
    }

    if ('tail' in handler && typeof handler.tail === 'function' && !isInstrumented(handler.tail)) {
      handler.tail = new Proxy(handler.tail, {
        apply(target, thisArg, args: Parameters<ExportedHandlerTailHandler<Env>>) {
          const [, env, ctx] = args;
          const context = copyExecutionContext(ctx);
          args[2] = context;

          return withIsolationScope(async isolationScope => {
            const options = getFinalOptions(optionsCallback(env), env);

            const waitUntil = context.waitUntil.bind(context);

            const client = init({ ...options, ctx: context });
            isolationScope.setClient(client);

            addCloudResourceContext(isolationScope);

            try {
              return await (target.apply(thisArg, args) as ReturnType<typeof target>);
            } catch (e) {
              captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.tail' } });
              throw e;
            } finally {
              waitUntil(flush(2000));
            }
          });
        },
      });

      markAsInstrumented(handler.tail);
    }

    // This is here because Miniflare sometimes cannot get instrumented
  } catch {
    // Do not console anything here, we don't want to spam the console with errors
  }

  return handler;
}
