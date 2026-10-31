import type { MessageBatch } from '@cloudflare/workers-types';
import type { AnyExportedHandler } from '../../types';
import { TraceFlags } from '@opentelemetry/api';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import {
  SENTRY_LINK_TYPE,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  FAAS_TRIGGER,
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_RETRY_COUNT,
  MESSAGING_OPERATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
} from '@sentry/conventions/attributes';
import { QUEUE_PROCESS } from '@sentry/conventions/op';
import type { SpanLink } from '@sentry/core';
import { captureException, startSpan, withIsolationScope } from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { extractQueueTraceContext } from '../../utils/queueTraceMeta';
import { instrumentEnv } from './instrumentEnv';

function extractQueueTraceLinks(batch: MessageBatch): SpanLink[] {
  const linkedSpans = new Set<string>();
  const links: SpanLink[] = [];

  for (const message of batch.messages) {
    const producerContext = extractQueueTraceContext(message.body);
    if (!producerContext) {
      continue;
    }

    // `sendBatch` stamps every message with the same publish span, so link each producer only once.
    const spanKey = `${producerContext.traceId}-${producerContext.spanId}`;
    if (linkedSpans.has(spanKey)) {
      continue;
    }
    linkedSpans.add(spanKey);

    links.push({
      context: {
        traceId: producerContext.traceId,
        spanId: producerContext.spanId,
        traceFlags: producerContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
      },
      attributes: {
        [SENTRY_LINK_TYPE]: 'message_origin',
      },
    });
  }

  return links;
}

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
        // A batch can mix messages from unrelated traces, so continuing any one of them would invent
        // a false parent. Keep queue.process as a root span and link every producer instead.
        links: extractQueueTraceLinks(batch),
        attributes: {
          [SENTRY_OP]: QUEUE_PROCESS,
          [FAAS_TRIGGER]: 'pubsub',
          [MESSAGING_DESTINATION_NAME]: batch.queue,
          [MESSAGING_SYSTEM]: 'cloudflare',
          [MESSAGING_OPERATION_TYPE]: 'process',
          [MESSAGING_OPERATION_NAME]: 'process',
          [MESSAGING_BATCH_MESSAGE_COUNT]: batch.messages.length,
          [MESSAGING_MESSAGE_RETRY_COUNT]: batch.messages.reduce((acc, message) => acc + message.attempts - 1, 0),
          [SENTRY_ORIGIN]: 'auto.faas.cloudflare.queue',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'task',
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
