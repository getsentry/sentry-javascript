import { getClient, getCurrentScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../semanticAttributes';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../../tracing';
import {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
} from '../../tracing/dynamicSamplingContext';
import { dynamicSamplingContextToSentryBaggageHeader } from '../../utils/baggage';
import { debug } from '../../utils/debug-logger';
import { isPlainObject } from '../../utils/is';
import { spanToTraceContext, spanToTraceHeader } from '../../utils/spanUtils';
import { captureSupabaseError } from './errors';
import {
  _calculateMessageBodySize,
  _captureQueueError,
  _createQueueBreadcrumb,
  _extractMessageIds,
} from './queue-utils';
import type { SupabaseResponse } from './types';
import { _normalizeRpcFunctionName } from './utils';

/**
 * Instruments RPC producer methods for queue message production.
 *
 * Creates queue.publish spans and injects trace context into messages
 * for distributed tracing across producer/consumer boundaries.
 */
export function _instrumentRpcProducer(target: unknown, thisArg: unknown, argumentsList: unknown[]): Promise<unknown> {
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const maybeQueueParams = argumentsList[1];

  if (!isPlainObject(maybeQueueParams)) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const queueParams = maybeQueueParams as { queue_name?: string; message?: unknown; messages?: unknown[] };
  const queueName = queueParams?.queue_name;

  if (!queueName) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const operationName = _normalizeRpcFunctionName(argumentsList[0]) as 'send' | 'send_batch';
  const isBatch = operationName === 'send_batch';

  DEBUG_BUILD &&
    debug.log('Instrumenting Supabase queue producer', {
      operation: operationName,
      queueName,
      isBatch,
    });

  const messageBodySize = _calculateMessageBodySize(queueParams?.message || queueParams?.messages);

  // Cloudflare pattern: op='db.queue' for valid transactions, 'queue.publish' for Queue Insights.
  // Works both as child spans and root spans.
  return startSpan(
    {
      name: `publish ${queueName || 'unknown'}`,
      op: 'db.queue',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        'messaging.system': 'supabase',
        'messaging.destination.name': queueName,
        'messaging.operation.name': operationName,
        'messaging.operation.type': 'publish',
        ...(messageBodySize !== undefined && { 'messaging.message.body.size': messageBodySize }),
      },
    },
    span => {
      const sentryTrace = spanToTraceHeader(span);
      const scope = getCurrentScope();
      const client = getClient();
      const { dsc } = scope.getPropagationContext();
      const traceContext = spanToTraceContext(span);
      const sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(
        dsc ||
          (client ? getDynamicSamplingContextFromClient(traceContext.trace_id, client) : undefined) ||
          getDynamicSamplingContextFromSpan(span),
      );

      const originalParams = argumentsList[1] as {
        queue_name: string;
        messages?: Array<{ _sentry?: { sentry_trace?: string; baggage?: string } }>;
        message?: { _sentry?: { sentry_trace?: string; baggage?: string } };
      };

      // Shallow copy to avoid mutating the caller's original params
      const paramsWithTrace: typeof originalParams = {
        ...originalParams,
      };

      // Inject trace context — only into plain objects to avoid corrupting primitives/arrays
      if (originalParams?.message) {
        if (isPlainObject(originalParams.message)) {
          paramsWithTrace.message = {
            ...originalParams.message,
            _sentry: {
              sentry_trace: sentryTrace,
              baggage: sentryBaggage,
            },
          };
        } else {
          DEBUG_BUILD &&
            debug.warn(
              'Skipping trace propagation for non-object message payload. PGMQ supports primitives and arrays, but trace context can only be injected into plain objects.',
            );
        }
      } else if (Array.isArray(originalParams?.messages)) {
        paramsWithTrace.messages = originalParams.messages.map(message => {
          if (isPlainObject(message)) {
            return {
              ...message,
              _sentry: {
                sentry_trace: sentryTrace,
                baggage: sentryBaggage,
              },
            };
          } else {
            DEBUG_BUILD &&
              debug.warn(
                'Skipping trace propagation for non-object message in batch. PGMQ supports primitives and arrays, but trace context can only be injected into plain objects.',
              );
            return message;
          }
        });
      }

      const modifiedArgumentsList = [argumentsList[0], paramsWithTrace, ...argumentsList.slice(2)];

      const promise = Reflect.apply(
        target as (...args: unknown[]) => Promise<unknown>,
        thisArg,
        modifiedArgumentsList,
      ) as Promise<SupabaseResponse>;
      return promise
        .then((res: SupabaseResponse) => {
          const messageId = _extractMessageIds(res.data);

          if (messageId) {
            span.setAttribute('messaging.message.id', messageId);
          }

          if (isBatch && Array.isArray(res.data)) {
            span.setAttribute('messaging.batch.message_count', res.data.length);
          }

          const breadcrumbData: Record<string, unknown> = {
            'messaging.destination.name': queueName,
          };
          if (messageId) {
            breadcrumbData['messaging.message.id'] = messageId;
          }
          if (messageBodySize !== undefined) {
            breadcrumbData['messaging.message.body.size'] = messageBodySize;
          }
          if (isBatch && Array.isArray(res.data)) {
            breadcrumbData['messaging.batch.message_count'] = res.data.length;
          }
          _createQueueBreadcrumb('queue.publish', queueName, breadcrumbData);

          if (res.error) {
            _captureQueueError(res.error, queueName, messageId, { operation: operationName });
          }

          span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

          return res;
        })
        .catch((err: unknown) => {
          span.setStatus({ code: SPAN_STATUS_ERROR });

          captureSupabaseError(err, 'auto.db.supabase.queue', { queueName, operation: operationName });

          throw err;
        });
    },
  );
}
