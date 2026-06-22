import type { Attributes, AttributeValue as OtelAttributeValue, Span } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { captureException } from '@sentry/core';
import type { AttributeValue, TelemetrySpan } from './types';

function toOtelAttributeValue(value: AttributeValue): OtelAttributeValue {
  return value as OtelAttributeValue;
}

function toOtelAttributes(attributes: Record<string, AttributeValue>): Attributes {
  return attributes as Attributes;
}

export class SentryBullMQSpan implements TelemetrySpan {
  private _span: Span;
  private _scope: Scope;

  public constructor(span: Span, scope: Scope) {
    this._span = span;
    this._scope = scope;
  }

  public setAttribute(key: string, value: AttributeValue): void {
    this._span.setAttribute(key, toOtelAttributeValue(value));
  }

  public setAttributes(attributes: Record<string, AttributeValue>): void {
    this._span.setAttributes(toOtelAttributes(attributes));
  }

  public addEvent(name: string, attributes?: Record<string, AttributeValue>): void {
    this._span.addEvent(name, attributes ? toOtelAttributes(attributes) : undefined);

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

  public recordException(exception: Error | string | { code?: number; message?: string; name?: string }): void {
    const error =
      exception instanceof Error
        ? exception
        : new Error(typeof exception === 'string' ? exception : exception.message || 'Unknown error');

    this._span.recordException(error);

    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.queue.bullmq',
      },
    });
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
