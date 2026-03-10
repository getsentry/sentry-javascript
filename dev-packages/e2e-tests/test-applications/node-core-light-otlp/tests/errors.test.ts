import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should capture errors with correct tags', async ({ request }) => {
  const errorEventPromise = waitForError('node-core-light-otlp', event => {
    return event?.exception?.values?.[0]?.value === 'Test error from light+otel';
  });

  const response = await request.get('/test-error');
  expect(response.status()).toBe(500);

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Test error from light+otel');
  expect(errorEvent.tags?.test).toBe('error');
});

test('should link error events to the active OTel trace context', async ({ request }) => {
  const errorEventPromise = waitForError('node-core-light-otlp', event => {
    return event?.exception?.values?.[0]?.value === 'Error inside OTel span';
  });

  await request.get('/test-otel-span');

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();

  // The error event should have trace context from the OTel span
  expect(errorEvent.contexts?.trace).toBeDefined();
  expect(errorEvent.contexts?.trace?.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(errorEvent.contexts?.trace?.span_id).toMatch(/[a-f0-9]{16}/);
});

test('should capture exceptions from span.recordException()', async ({ request }) => {
  const errorEventPromise = waitForError('node-core-light-otlp', event => {
    return event?.exception?.values?.[0]?.value === 'Recorded exception on span';
  });

  await request.get('/test-record-exception');

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Recorded exception on span');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.otlp.record_exception');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);

  // Should be linked to the OTel span's trace context
  expect(errorEvent.contexts?.trace?.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(errorEvent.contexts?.trace?.span_id).toMatch(/[a-f0-9]{16}/);
});
