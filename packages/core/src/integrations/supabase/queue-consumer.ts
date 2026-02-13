import { DEBUG_BUILD } from '../../debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
} from '../../semanticAttributes';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import { isPlainObject } from '../../utils/is';
import { extractTraceparentData } from '../../utils/tracing';
import { captureSupabaseError } from './errors';
import {
  _calculateMessageBodySize,
  _captureQueueError,
  _createQueueBreadcrumb,
  _extractMessageIds,
  _parseEnqueuedAtLatency,
} from './queue-utils';
import type { SupabaseResponse } from './types';
import { _normalizeRpcFunctionName } from './utils';

/**
 * Calculates average latency for batch messages.
 */
function _calculateBatchLatency(messages: Array<{ enqueued_at?: string }>): number | undefined {
  let totalLatency = 0;
  let count = 0;

  for (const msg of messages) {
    const latency = _parseEnqueuedAtLatency(msg.enqueued_at);
    if (latency !== undefined) {
      totalLatency += latency;
      count++;
    }
  }

  return count > 0 ? totalLatency / count : undefined;
}

function _processConsumerSpan(span: Span, res: SupabaseResponse, queueName: string | undefined): SupabaseResponse {
  const data = res.data;
  if (!data || !Array.isArray(data)) {
    span.setAttribute('messaging.message.retry.count', 0);
    span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

    const breadcrumbData: Record<string, unknown> = {};
    if (queueName) {
      breadcrumbData['messaging.destination.name'] = queueName;
    }
    _createQueueBreadcrumb('queue.process', queueName, Object.keys(breadcrumbData).length ? breadcrumbData : undefined);

    if (res.error) {
      _captureQueueError(res.error, queueName);
    }

    return res;
  }

  const firstItem = data.length > 0 ? data[0] : undefined;
  const isBatch = data.length > 1;

  const latency = isBatch
    ? _calculateBatchLatency(data as Array<{ enqueued_at?: string }>)
    : _parseEnqueuedAtLatency((firstItem as { enqueued_at?: string } | undefined)?.enqueued_at);

  const messageId = _extractMessageIds(data);

  span.setAttribute('messaging.batch.message_count', data.length);

  if (messageId) {
    span.setAttribute('messaging.message.id', messageId);
  }

  if (latency !== undefined) {
    span.setAttribute('messaging.message.receive.latency', latency);
  }

  const readCount = firstItem?.read_ct ?? 0;
  const retryCount = Math.max(0, readCount - 1);
  span.setAttribute('messaging.message.retry.count', retryCount);

  const messageBodySize = _calculateMessageBodySize(firstItem?.message);
  if (messageBodySize !== undefined) {
    span.setAttribute('messaging.message.body.size', messageBodySize);
  }

  const breadcrumbData: Record<string, unknown> = {};
  if (messageId) breadcrumbData['messaging.message.id'] = messageId;
  if (queueName) breadcrumbData['messaging.destination.name'] = queueName;
  if (messageBodySize !== undefined) breadcrumbData['messaging.message.body.size'] = messageBodySize;
  _createQueueBreadcrumb('queue.process', queueName, breadcrumbData);

  if (res.error) {
    _captureQueueError(res.error, queueName, messageId);
  }

  span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

  return res;
}

/**
 * Instruments RPC consumer methods for queue message consumption.
 *
 * Creates queue.process spans and extracts trace context from messages
 * for distributed tracing across producer/consumer boundaries.
 */
export function _instrumentRpcConsumer(target: unknown, thisArg: unknown, argumentsList: unknown[]): Promise<unknown> {
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  if (typeof argumentsList[0] !== 'string') {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const operationName = _normalizeRpcFunctionName(argumentsList[0]);
  const queueParams = argumentsList[1];

  if (!isPlainObject(queueParams)) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const typedParams = queueParams as { queue_name?: string; vt?: number; qty?: number };
  const queueName = typedParams.queue_name;

  if (!queueName) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  DEBUG_BUILD &&
    debug.log('Instrumenting Supabase queue consumer', {
      operation: operationName,
      queueName,
    });

  const spanName = `process ${queueName || 'unknown'}`;
  // Cloudflare pattern: op='db.queue' for valid transactions, 'queue.process' for Queue Insights.
  // Works both as child spans and root spans.
  const spanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.consumer',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
    'messaging.system': 'supabase',
    'messaging.destination.name': queueName,
    'messaging.operation.name': operationName,
    'messaging.operation.type': 'process',
  } as const;

  // Wrap the entire RPC call with startSpan to ensure the span is created before the async operation
  // and is properly attached to the current transaction context.
  return startSpan(
    {
      name: spanName,
      op: 'db.queue',
      attributes: spanAttributes,
    },
    span => {
      const rpcPromise = Reflect.apply(
        target as (...args: unknown[]) => Promise<unknown>,
        thisArg,
        argumentsList,
      ) as Promise<SupabaseResponse>;

      return rpcPromise.then(
        (res: SupabaseResponse) => {
          DEBUG_BUILD && debug.log('Consumer RPC call completed', { queueName, hasData: !!res.data });

          if ((!res.data || (Array.isArray(res.data) && res.data.length === 0)) && !res.error) {
            DEBUG_BUILD && debug.log('Consumer received empty response', { queueName });
            span.setStatus({ code: SPAN_STATUS_OK });
            span.setAttribute('messaging.batch.message_count', 0);
            span.setAttribute('messaging.message.retry.count', 0);
            const breadcrumbData: Record<string, unknown> = {
              'messaging.batch.message_count': 0,
            };
            if (queueName) {
              breadcrumbData['messaging.destination.name'] = queueName;
            }
            _createQueueBreadcrumb('queue.process', queueName, breadcrumbData);
            return res;
          }

          // Extract trace context from first message before cleanup
          const firstMessage = res.data?.[0]?.message;
          const sentryTrace = firstMessage?._sentry?.sentry_trace;

          // Clean up _sentry metadata from messages before returning to user
          if (Array.isArray(res.data)) {
            const hasMetadata = res.data.some(
              item =>
                item &&
                typeof item === 'object' &&
                item.message &&
                typeof item.message === 'object' &&
                '_sentry' in item.message,
            );

            if (hasMetadata) {
              res.data = res.data.map(item => {
                if (item && typeof item === 'object' && item.message && typeof item.message === 'object') {
                  const messageCopy = { ...(item.message as Record<string, unknown>) };
                  delete messageCopy._sentry;
                  return { ...item, message: messageCopy };
                }
                return item;
              });
            }
          }

          if (sentryTrace) {
            const traceparentData = extractTraceparentData(sentryTrace);
            if (traceparentData?.traceId && traceparentData?.parentSpanId) {
              const traceFlags = traceparentData.parentSampled ? 1 : 0;

              span.addLink({
                context: {
                  traceId: traceparentData.traceId,
                  spanId: traceparentData.parentSpanId,
                  traceFlags,
                },
                attributes: { [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'queue.producer' },
              });
            }
          }

          try {
            const processedResponse = _processConsumerSpan(span, res, queueName);
            DEBUG_BUILD && debug.log('Consumer span processed successfully', { queueName });
            return processedResponse;
          } catch (err: unknown) {
            DEBUG_BUILD && debug.log('Consumer span processing failed', { queueName, error: err });

            captureSupabaseError(err, 'auto.db.supabase.queue', { queueName });

            span.setStatus({ code: SPAN_STATUS_ERROR });
            return res;
          }
        },
        (err: unknown) => {
          DEBUG_BUILD && debug.log('Consumer RPC call failed', { queueName, error: err });

          _createQueueBreadcrumb('queue.process', queueName, {
            'messaging.destination.name': queueName,
          });

          captureSupabaseError(err, 'auto.db.supabase.queue', { queueName });

          span.setStatus({ code: SPAN_STATUS_ERROR });
          throw err;
        },
      );
    },
  );
}
