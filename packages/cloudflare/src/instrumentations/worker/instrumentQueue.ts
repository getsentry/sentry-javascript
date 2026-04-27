import type { ExportedHandler, Message, MessageBatch } from '@cloudflare/workers-types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  type SpanLink,
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
import { readQueueEnvelope } from '../../utils/queueEnvelope';
import { buildSpanLinks, type StoredSpanContext } from '../../utils/traceLinks';
import { instrumentEnv } from './instrumentEnv';

/**
 * Scans the batch for trace-context envelopes (when `enableQueueTracePropagation`
 * is enabled). Returns the batch the user handler should see (with each
 * envelope-wrapped Message proxied to expose the original body) plus the set
 * of unique producer spans the consumer span should link to.
 */
interface BatchEnvelopeResult {
  batch: MessageBatch;
  /** Links to all unique producer spans across the batch (for span.links). */
  links: SpanLink[];
  /** First producer span — used for the `sentry.previous_trace` attribute that
   * Sentry's UI reads to render the linked-traces panel. */
  primaryContext?: StoredSpanContext;
}

function processBatchEnvelopes(batch: MessageBatch): BatchEnvelopeResult {
  const seen = new Set<string>();
  const links: SpanLink[] = [];
  let primaryContext: StoredSpanContext | undefined;

  const wrappedMessages = batch.messages.map(message => {
    const envelope = readQueueEnvelope(message.body);
    if (!envelope) {
      return message;
    }
    const { trace_id, span_id, sampled } = envelope.__sentry_v1;
    const key = `${trace_id}:${span_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      const stored: StoredSpanContext = { traceId: trace_id, spanId: span_id, sampled };
      links.push(...buildSpanLinks(stored));
      if (!primaryContext) {
        primaryContext = stored;
      }
    }
    return new Proxy(message, {
      get(target, prop, receiver) {
        if (prop === 'body') {
          return envelope.body;
        }
        const value = Reflect.get(target, prop, receiver);
        // Cloudflare's Message methods (ack, retry) check `this` identity
        // against the original Message. Calling them through the Proxy
        // without rebinding throws "Illegal invocation".
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
    }) as Message;
  });

  const wrappedBatch: MessageBatch = {
    queue: batch.queue,
    messages: wrappedMessages,
    retryAll: batch.retryAll.bind(batch),
    ackAll: batch.ackAll.bind(batch),
  };

  return { batch: wrappedBatch, links, primaryContext };
}

/**
 * Core queue handler logic - wraps execution with Sentry instrumentation.
 *
 * `runHandler` receives the batch the user handler should see. When
 * `enableQueueTracePropagation` is on, that batch has trace-context envelopes
 * stripped from each message body.
 */
function wrapQueueHandler(
  batch: MessageBatch,
  options: CloudflareOptions,
  context: ExecutionContext,
  runHandler: (effectiveBatch: MessageBatch) => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    const {
      batch: effectiveBatch,
      links,
      primaryContext,
    } = options.enableQueueTracePropagation
      ? processBatchEnvelopes(batch)
      : { batch, links: [], primaryContext: undefined };

    // Sentry's trace UI currently reads `sentry.previous_trace` (an attribute)
    // to render the previous-trace panel. Long-term EAP will read span links
    // directly and this can be dropped — see TODO(v11) in wrapMethodWithSentry.
    const previousTraceAttribute = primaryContext
      ? `${primaryContext.traceId}-${primaryContext.spanId}-${primaryContext.sampled ? '1' : '0'}`
      : undefined;

    return startSpan(
      {
        op: 'faas.queue',
        name: `process ${batch.queue}`,
        links: links.length > 0 ? links : undefined,
        attributes: {
          'faas.trigger': 'pubsub',
          'messaging.destination.name': batch.queue,
          'messaging.system': 'cloudflare',
          'messaging.operation.type': 'process',
          'messaging.operation.name': 'process',
          'messaging.batch.message_count': batch.messages.length,
          'messaging.message.retry.count': batch.messages.reduce((acc, message) => acc + message.attempts - 1, 0),
          ...(previousTraceAttribute ? { 'sentry.previous_trace': previousTraceAttribute } : {}),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.queue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        },
      },
      async () => {
        try {
          return await runHandler(effectiveBatch);
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

          return wrapQueueHandler(batch, options, context, effectiveBatch => {
            args[0] = effectiveBatch;
            return target.apply(thisArg, args);
          });
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

      return wrapQueueHandler(batch, options, context, effectiveBatch => {
        args[0] = effectiveBatch;
        return Reflect.apply(target, thisArg, args);
      });
    },
  });
}
