import type { Attributes, Span } from '@opentelemetry/api';
import {
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_BULLMQ_FLOW_NAME,
  MESSAGING_BULLMQ_JOB_ATTEMPT_FINISHED_TIMESTAMP,
  MESSAGING_BULLMQ_JOB_BULK_NAMES,
  MESSAGING_BULLMQ_JOB_DEDUPLICATION_KEY,
  MESSAGING_BULLMQ_JOB_IDS,
  MESSAGING_BULLMQ_JOB_KEY,
  MESSAGING_BULLMQ_JOB_NAME,
  MESSAGING_BULLMQ_JOB_PROCESSED_TIMESTAMP,
  MESSAGING_BULLMQ_JOB_SCHEDULER_ID,
  MESSAGING_BULLMQ_JOB_STATE,
  MESSAGING_BULLMQ_JOB_TYPE,
  MESSAGING_BULLMQ_QUEUE_CLEAN_COUNT,
  MESSAGING_BULLMQ_QUEUE_CLEAN_LIMIT,
  MESSAGING_BULLMQ_QUEUE_DRAIN_DELAY,
  MESSAGING_BULLMQ_QUEUE_EVENT_MAX_LENGTH,
  MESSAGING_BULLMQ_QUEUE_GRACE,
  MESSAGING_BULLMQ_QUEUE_JOBS_STATE,
  MESSAGING_BULLMQ_QUEUE_RATE_LIMIT,
  MESSAGING_BULLMQ_WORKER_DO_NOT_WAIT_ACTIVE,
  MESSAGING_BULLMQ_WORKER_FORCE_CLOSE,
  MESSAGING_BULLMQ_WORKER_JOBS_TO_EXTEND_LOCKS,
  MESSAGING_BULLMQ_WORKER_NAME,
  MESSAGING_BULLMQ_WORKER_RATE_LIMIT,
  MESSAGING_BULLMQ_WORKER_STALLED_JOBS,
  MESSAGING_CLIENT_ID,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_MESSAGE_RETRY_COUNT,
  MESSAGING_OPERATION_NAME,
} from '@sentry/conventions/attributes';
import type { Scope } from '@sentry/core';
import { captureException, SPAN_STATUS_ERROR } from '@sentry/core';
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

// The BullMQ attribute keys and their `messaging.bullmq.*` keys in the Sentry conventions. Where BullMQ separates
// the words of a key with dots, the Sentry key uses snake_case.
const MESSAGING_BULLMQ_KEYS = new Map([
  ['bullmq.flow.name', MESSAGING_BULLMQ_FLOW_NAME],
  ['bullmq.job.attempt_finished_timestamp', MESSAGING_BULLMQ_JOB_ATTEMPT_FINISHED_TIMESTAMP],
  ['bullmq.job.bulk.names', MESSAGING_BULLMQ_JOB_BULK_NAMES],
  ['bullmq.job.deduplication.key', MESSAGING_BULLMQ_JOB_DEDUPLICATION_KEY],
  ['bullmq.job.ids', MESSAGING_BULLMQ_JOB_IDS],
  ['bullmq.job.key', MESSAGING_BULLMQ_JOB_KEY],
  ['bullmq.job.name', MESSAGING_BULLMQ_JOB_NAME],
  ['bullmq.job.processed.timestamp', MESSAGING_BULLMQ_JOB_PROCESSED_TIMESTAMP],
  ['bullmq.job.scheduler.id', MESSAGING_BULLMQ_JOB_SCHEDULER_ID],
  ['bullmq.job.type', MESSAGING_BULLMQ_JOB_TYPE],
  ['bullmq.queue.clean.count', MESSAGING_BULLMQ_QUEUE_CLEAN_COUNT],
  ['bullmq.queue.clean.limit', MESSAGING_BULLMQ_QUEUE_CLEAN_LIMIT],
  ['bullmq.queue.drain.delay', MESSAGING_BULLMQ_QUEUE_DRAIN_DELAY],
  ['bullmq.queue.event.max.length', MESSAGING_BULLMQ_QUEUE_EVENT_MAX_LENGTH],
  ['bullmq.queue.grace', MESSAGING_BULLMQ_QUEUE_GRACE],
  ['bullmq.queue.jobs.state', MESSAGING_BULLMQ_QUEUE_JOBS_STATE],
  ['bullmq.queue.rate.limit', MESSAGING_BULLMQ_QUEUE_RATE_LIMIT],
  ['bullmq.worker.do.not.wait.active', MESSAGING_BULLMQ_WORKER_DO_NOT_WAIT_ACTIVE],
  ['bullmq.worker.force.close', MESSAGING_BULLMQ_WORKER_FORCE_CLOSE],
  ['bullmq.worker.jobs.to.extend.locks', MESSAGING_BULLMQ_WORKER_JOBS_TO_EXTEND_LOCKS],
  ['bullmq.worker.name', MESSAGING_BULLMQ_WORKER_NAME],
  ['bullmq.worker.rate.limit', MESSAGING_BULLMQ_WORKER_RATE_LIMIT],
  ['bullmq.worker.stalled.jobs', MESSAGING_BULLMQ_WORKER_STALLED_JOBS],
]);

/**
 * Returns the Sentry key for a `bullmq.*` attribute key or metric name: the key from `MESSAGING_BULLMQ_KEYS`, or
 * `messaging.<key>` for the keys that are not in it, such as the metric names. Returns all other keys unchanged.
 */
export function toMessagingKey(key: string): string {
  return MESSAGING_BULLMQ_KEYS.get(key) ?? (key.startsWith('bullmq.') ? `messaging.${key}` : key);
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

  for (const [key, value] of Object.entries(rest)) {
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
    result[MESSAGING_CLIENT_ID] = workerId;
  }

  // BullMQ before 5.81.2 sets `bullmq.job.status` instead of `bullmq.job.state`.
  const state = jobState ?? jobStatus;
  if (typeof state === 'string') {
    result[MESSAGING_BULLMQ_JOB_STATE] = state;
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
    this._span.addEvent(name, attributes);

    // BullMQ sends this event from `Worker.handleFailed`, and the event name is not an exported constant:
    // https://github.com/taskforcesh/bullmq/blob/01b8b14a973984845dc0bbcefccf35b3ed30782d/src/classes/worker.ts#L1223-L1225
    if (name === 'job failed') {
      this._span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

      const reason = attributes?.['bullmq.job.failed.reason'];
      const error = new Error(String(reason || 'Unknown error'));
      // BullMQ passes only the error message (https://github.com/taskforcesh/bullmq/issues/4902), so this stack has only
      // BullMQ and SDK frames, the same for every job. Without it, Sentry groups the errors by their message.
      error.stack = undefined;
      captureException(error, {
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
