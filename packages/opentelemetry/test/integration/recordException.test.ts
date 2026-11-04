import { trace } from '@opentelemetry/api';
import type { Event } from '@sentry/core';
import { spanExceptionsIntegration } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | recordException', () => {
  it('captures exceptions that OpenTelemetry instrumentation records on spans', async () => {
    const events: Event[] = [];
    const client = mockSdkInit({
      integrations: [spanExceptionsIntegration()],
      beforeSend: event => {
        events.push(event);
        return null;
      },
    });

    const span = trace.getTracer('@opentelemetry/instrumentation-pg').startSpan('pg.query:SELECT');
    span.recordException(new Error('Connection terminated unexpectedly'));
    span.end();

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values).toEqual([
      {
        type: 'Error',
        value: 'Connection terminated unexpectedly',
        mechanism: { type: 'auto.core.span_exceptions', handled: true },
      },
    ]);
    expect(events[0]?.contexts?.trace?.trace_id).toBe(span.spanContext().traceId);
    expect(events[0]?.contexts?.trace?.span_id).toBe(span.spanContext().spanId);
  });
});
