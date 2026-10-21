import type { Attributes, Span } from '@opentelemetry/api';
import {
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_MESSAGE_RETRY_COUNT,
  MESSAGING_OPERATION_NAME,
} from '@sentry/conventions/attributes';
import type { Scope } from '@sentry/core';
import { captureException } from '@sentry/core';
import type { AttributeValue, TelemetrySpan } from './types';

const DROPPED_ATTRIBUTES = new Set([
  // BullMQ sets these to `JSON.stringify()` output. They are left out until Sentry attributes support objects.
  'bullmq.job.options',
  'bullmq.job.progress',
  'bullmq.queue.options',
  'bullmq.worker.options',
  // BullMQ deprecated this for `bullmq.job.attempt_finished_timestamp`, which it sets on the same spans.
  'bullmq.job.finished.timestamp',
]);

function toOtelAttributes(attributes: Record<string, AttributeValue>): Attributes {
  return attributes as Attributes;
}

// BullMQ separates the words of these keys with dots. Sentry keys use dots only between sub-concepts.
const SNAKE_CASE_KEYS = new Map([
  ['bullmq.job.processed.timestamp', 'messaging.bullmq.job.processed_timestamp'],
  ['bullmq.queue.event.max.length', 'messaging.bullmq.queue.event.max_length'],
  ['bullmq.queue.rate.limit', 'messaging.bullmq.queue.rate_limit'],
  ['bullmq.worker.do.not.wait.active', 'messaging.bullmq.worker.do_not_wait_active'],
  ['bullmq.worker.force.close', 'messaging.bullmq.worker.force_close'],
  ['bullmq.worker.jobs.to.extend.locks', 'messaging.bullmq.worker.jobs_to_extend_locks'],
  ['bullmq.worker.rate.limit', 'messaging.bullmq.worker.rate_limit'],
  ['bullmq.worker.stalled.jobs', 'messaging.bullmq.worker.stalled_jobs'],
]);

/**
 * Returns the Sentry key for a `bullmq.*` attribute key or metric name: `messaging.<key>`, with snake_case for the
 * keys in `SNAKE_CASE_KEYS`. Returns all other keys unchanged.
 */
export function toMessagingKey(key: string): string {
  return SNAKE_CASE_KEYS.get(key) ?? (key.startsWith('bullmq.') ? `messaging.${key}` : key);
}

/**
 * Returns the BullMQ attributes with Sentry keys: the `messaging.*` convention where one exists, and the
 * `messaging.bullmq.*` key for all others. The attributes that hold JSON strings and the deprecated ones are left out.
 */
export function toSentryAttributes(attributes: Record<string, AttributeValue>): Attributes {
  const {
    'bullmq.queue.name': queueName,
    'bullmq.queue.operation': operation,
    'bullmq.job.id': jobId,
    'bullmq.job.attempts.made': attemptsMade,
    'bullmq.job.bulk.count': bulkCount,
    'bullmq.worker.id': workerId,
    'bullmq.job.state': jobState,
    'bullmq.job.status': jobStatus,
    ...rest
  } = attributes;
  const result: Attributes = {};

  for (const [key, value] of Object.entries(toOtelAttributes(rest))) {
    if (!DROPPED_ATTRIBUTES.has(key)) {
      result[toMessagingKey(key)] = value;
    }
  }

  if (typeof queueName === 'string') {
    result[MESSAGING_DESTINATION_NAME] = queueName;
  }

  if (typeof operation === 'string') {
    result[MESSAGING_OPERATION_NAME] = operation;
  }

  if (jobId !== undefined) {
    result[MESSAGING_MESSAGE_ID] = String(jobId);
  }

  // BullMQ counts the attempt that just finished in `attemptsMade`.
  if (typeof attemptsMade === 'number') {
    result[MESSAGING_MESSAGE_RETRY_COUNT] = Math.max(attemptsMade - 1, 0);
  }

  if (typeof bulkCount === 'number') {
    result[MESSAGING_BATCH_MESSAGE_COUNT] = bulkCount;
  }

  if (typeof workerId === 'string') {
    result['messaging.client.id'] = workerId;
  }

  // BullMQ before 5.81.2 sets `bullmq.job.status` instead of `bullmq.job.state`.
  const state = jobState ?? jobStatus;
  if (typeof state === 'string') {
    result['messaging.bullmq.job.state'] = state;
  }

  return result;
}

export class SentryBullMQSpan implements TelemetrySpan {
  private _span: Span;
  private _scope: Scope;

  public constructor(span: Span, scope: Scope) {
    this._span = span;
    this._scope = scope;
  }

  public setAttribute(key: string, value: AttributeValue): void {
    this.setAttributes({ [key]: value });
  }

  public setAttributes(attributes: Record<string, AttributeValue>): void {
    this._span.setAttributes(toSentryAttributes(attributes));
  }

  public addEvent(name: string, attributes?: Record<string, AttributeValue>): void {
    this._span.addEvent(name, attributes ? toOtelAttributes(attributes) : undefined);

    // BullMQ sends this event from `Worker.handleFailed`, and the event name is not an exported constant:
    // https://github.com/taskforcesh/bullmq/blob/01b8b14a973984845dc0bbcefccf35b3ed30782d/src/classes/worker.ts#L1223-L1225
    if (name === 'job failed') {
      const reason = attributes?.['bullmq.job.failed.reason'];
      captureException(new Error(String(reason || 'Unknown error')), {
        mechanism: {
          handled: false,
          type: 'auto.queue.bullmq',
        },
      });
    }
  }

  /**
   * Does not capture to Sentry. BullMQ calls this for Redis, lock and serialization errors that it
   * retries itself, often several times for one fault. Job failures are captured in `addEvent`.
   */
  public recordException(exception: Error | string | { code?: number; message?: string; name?: string }): void {
    const error =
      exception instanceof Error
        ? exception
        : new Error(typeof exception === 'string' ? exception : exception.message || 'Unknown error');

    this._span.recordException(error);
  }

  public setSpanOnContext(context: unknown): unknown {
    return {
      ...(context as object),
      span: this._span,
      scope: this._scope,
    };
  }

  public end(): void {
    this._span.end();
  }
}
