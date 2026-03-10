import type { ExportedHandler, MessageBatch } from '@cloudflare/workers-types';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { isInstrumented, markAsInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';

/**
 * Core queue handler logic - wraps execution with Sentry instrumentation.
 */
function wrapQueueHandler(
  batch: MessageBatch,
  options: CloudflareOptions,
  context: ExecutionContext,
  fn: () => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
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
          'messaging.message.retry.count': batch.messages.reduce((acc, message) => acc + message.attempts - 1, 0),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.queue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        },
      },
      async () => {
        try {
          return await fn();
        } catch (e) {
          captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.queue' } });
          throw e;
        } finally {
          waitUntil(flushAndDispose(client));
        }
      },
    );
  });
}

/**
 * Instruments a queue handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerQueue<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: Parameters<NonNullable<T['queue']>>[1]) => CloudflareOptions | undefined,
): void {
  if (!('queue' in handler) || typeof handler.queue !== 'function' || isInstrumented(handler.queue)) {
    return;
  }

  handler.queue = new Proxy(handler.queue, {
    apply(target, thisArg, args: Parameters<NonNullable<T['queue']>>) {
      const [batch, env, ctx] = args;
      const context = instrumentContext(ctx);
      args[2] = context;

      const options = getFinalOptions(optionsCallback(env), env);

      return wrapQueueHandler(batch, options, context, () => target.apply(thisArg, args));
    },
  });

  markAsInstrumented(handler.queue);
}
