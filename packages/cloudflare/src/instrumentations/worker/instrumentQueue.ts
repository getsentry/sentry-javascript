import type { MessageBatch } from '@cloudflare/workers-types';
import type { AnyExportedHandler } from '../../types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { MESSAGING_QUEUE_PROCESS_SPAN_OP } from '@sentry/conventions/op';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { instrumentEnv } from './instrumentEnv';

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

    setInvocationState(isolationScope, { ctx: context });

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    return startSpan(
      {
        name: `process ${batch.queue}`,
        attributes: {
          [SENTRY_OP]: MESSAGING_QUEUE_PROCESS_SPAN_OP,
          'faas.trigger': 'pubsub',
          'messaging.destination.name': batch.queue,
          'messaging.system': 'cloudflare',
          'messaging.operation.type': 'process',
          'messaging.operation.name': 'process',
          'messaging.batch.message_count': batch.messages.length,
          'messaging.message.retry.count': batch.messages.reduce((acc, message) => acc + message.attempts - 1, 0),
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
export function instrumentExportedHandlerQueue<T extends AnyExportedHandler>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  if (!('queue' in handler) || typeof handler.queue !== 'function') {
    return;
  }

  handler.queue = ensureInstrumented(
    handler.queue,
    original =>
      new Proxy(original, {
        apply(target, thisArg, args: Parameters<NonNullable<T['queue']>>) {
          const [batch, env, ctx] = args;
          const context = instrumentContext(ctx);
          const options = getFinalOptions(optionsCallback(env), env);
          args[1] = instrumentEnv(env, options);
          args[2] = context;

          return wrapQueueHandler(batch, options, context, () => target.apply(thisArg, args));
        },
      }),
  );
}

/**
 * Instruments a queue method for WorkerEntrypoint (options/context already available).
 */
export function instrumentWorkerEntrypointQueue<T extends WorkerEntrypoint>(
  instance: T,
  options: CloudflareOptions,
  context: ExecutionContext,
): void {
  if (!instance.queue) {
    return;
  }

  const original = instance.queue.bind(instance);
  instance.queue = new Proxy(original, {
    apply(target, thisArg, args: [MessageBatch]) {
      const [batch] = args;

      return wrapQueueHandler(batch, options, context, () => Reflect.apply(target, thisArg, args));
    },
  });
}
