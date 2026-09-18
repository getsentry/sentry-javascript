import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('links errors to the active OpenTelemetry span', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-otel-sdk-node', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await fetch(`${baseURL}/test-telemetry/123`);
  const { traceId, spanId } = (await response.json()) as { traceId: string; spanId: string };

  const errorEvent = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toEqual({ trace_id: traceId, span_id: spanId });
});

test('links errors from the Sentry instrumentation to the active OpenTelemetry span', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-otel-sdk-node', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'This is an exception with id 456';
  });

  const response = await fetch(`${baseURL}/test-exception/456`);
  const { traceId, spanId } = (await response.json()) as { traceId: string; spanId: string };

  const errorEvent = await errorEventPromise;

  // With tracing off, Sentry's channel instrumentation still runs and reports the errors express
  // never handles.
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.http.express', handled: false });
  expect(errorEvent.contexts?.trace).toEqual({ trace_id: traceId, span_id: spanId });
});
