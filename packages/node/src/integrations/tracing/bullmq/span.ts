import type { Attributes, Span } from '@opentelemetry/api';
import {
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_MESSAGE_RETRY_COUNT,
} from '@sentry/conventions/attributes';
import type { Scope } from '@sentry/core';
import { captureException } from '@sentry/core';
import type { AttributeValue, TelemetrySpan } from './types';

function toOtelAttributes(attributes: Record<string, AttributeValue>): Attributes {
  return attributes as Attributes;
}

/**
 * Returns the BullMQ attributes plus the `messaging.*` attributes that Sentry's Queues module reads.
 */
export function toSentryAttributes(attributes: Record<string, AttributeValue>): Attributes {
  const result = { ...toOtelAttributes(attributes) };
  const queueName = attributes['bullmq.queue.name'];
  const jobId = attributes['bullmq.job.id'];
  const attemptsMade = attributes['bullmq.job.attempts.made'];

  if (typeof queueName === 'string') {
    result[MESSAGING_DESTINATION_NAME] = queueName;
  }

  if (jobId !== undefined) {
    result[MESSAGING_MESSAGE_ID] = String(jobId);
  }

  // BullMQ counts the attempt that just finished in `attemptsMade`.
  if (typeof attemptsMade === 'number') {
    result[MESSAGING_MESSAGE_RETRY_COUNT] = Math.max(attemptsMade - 1, 0);
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
