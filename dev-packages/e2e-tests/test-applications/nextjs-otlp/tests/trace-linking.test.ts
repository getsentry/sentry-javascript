import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForError, waitForMetric, waitForRequest } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import { triggerTelemetry, waitForExportedSpan } from './otlp';

test('stamps captured exceptions with the trace of the active OpenTelemetry span', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '123');
  const errorEvent = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toEqual({ trace_id: traceId, span_id: spanId });
});

test('stamps logs with the trace of the active OpenTelemetry span', async ({ baseURL }) => {
  const logEnvelopePromise = waitForEnvelopeItem('nextjs-otlp', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(item => item.body === 'This is a log with id 124')
    );
  });

  const { traceId } = await triggerTelemetry(baseURL as string, '124');
  const logEnvelope = await logEnvelopePromise;

  const log = (logEnvelope[1] as SerializedLogContainer).items.find(item => item.body === 'This is a log with id 124');
  expect(log?.trace_id).toBe(traceId);
});

test('stamps metrics with the trace of the active OpenTelemetry span', async ({ baseURL }) => {
  const metricPromise = waitForMetric('nextjs-otlp', metric => {
    return metric.name === 'sentry.test.count' && metric.attributes?.id?.value === '125';
  });

  const { traceId } = await triggerTelemetry(baseURL as string, '125');
  const metric = await metricPromise;

  expect(metric.trace_id).toBe(traceId);
});

test('sends no envelope trace header while riding along on an OpenTelemetry span', async ({ baseURL }) => {
  const envelopePromise = waitForRequest('nextjs-otlp', ({ envelope }) => {
    const [, items] = envelope;
    return items.some(
      item =>
        (item[1] as { exception?: { values?: { value?: string }[] } })?.exception?.values?.[0]?.value ===
        'This is an exception with id 126',
    );
  });

  await triggerTelemetry(baseURL as string, '126');
  const { envelope } = await envelopePromise;
  const [envelopeHeaders] = envelope;

  // The Sentry scope's sampling context describes a different trace than the OpenTelemetry one the
  // event is stamped with, so no `trace` header is sent rather than one naming the wrong trace.
  expect((envelopeHeaders as { trace?: unknown }).trace).toBeUndefined();
});

test('links captured exceptions to the request span the app exports over OTLP', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 135';
  });

  const { traceId } = await triggerTelemetry(baseURL as string, '135');
  const errorEvent = await errorEventPromise;

  const requestSpan = await waitForExportedSpan(
    span => span.name === 'GET /api/telemetry/[id]' && span.traceId === traceId,
    `the request span for trace ${traceId}`,
  );

  expect(errorEvent.contexts?.trace?.trace_id).toBe(requestSpan.traceId);
  expect(requestSpan.parentSpanId).toBeUndefined();
});

test('captures errors thrown in route handlers on the request trace', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is a route handler error with id 246';
  });

  const response = await fetch(`${baseURL}/api/route-handler-error/246`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const traceId = errorEvent.contexts?.trace?.trace_id as string;
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);

  const requestSpan = await waitForExportedSpan(
    span => span.name === 'GET /api/route-handler-error/[id]' && span.traceId === traceId,
    `the request span for trace ${traceId}`,
  );

  expect(requestSpan.parentSpanId).toBeUndefined();
  expect(errorEvent.transaction).toBe('GET /api/route-handler-error/[id]');
  // Webpack builds wrap the handler at build time, Turbopack builds rely on `onRequestError`.
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: expect.stringMatching(/^auto\.function\.nextjs\.(route_handler|on_request_error)$/),
  });
});

test('captures errors thrown in server components on the request trace', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is a server component error with id 357';
  });

  const response = await fetch(`${baseURL}/server-component-error/357`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const traceId = errorEvent.contexts?.trace?.trace_id as string;
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);

  const requestSpan = await waitForExportedSpan(
    span => span.name === 'GET /server-component-error/[id]' && span.traceId === traceId,
    `the request span for trace ${traceId}`,
  );

  expect(requestSpan.parentSpanId).toBeUndefined();
  // Webpack builds wrap the component at build time, Turbopack builds rely on `onRequestError`.
  expect(errorEvent.transaction).toContain('/server-component-error/[id]');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: expect.stringMatching(/^auto\.function\.nextjs\.(server_component|on_request_error)$/),
  });
});

test('keeps concurrent requests on separate traces', async ({ baseURL }) => {
  const errorEventPromises = ['567', '678'].map(id =>
    waitForError('nextjs-otlp', event => {
      return event.exception?.values?.[0]?.value === `This is an exception with id ${id}`;
    }),
  );

  const [first, second] = await Promise.all([
    triggerTelemetry(baseURL as string, '567'),
    triggerTelemetry(baseURL as string, '678'),
  ]);

  const [firstError, secondError] = await Promise.all(errorEventPromises);

  expect(first.traceId).not.toBe(second.traceId);
  expect(firstError.contexts?.trace?.trace_id).toBe(first.traceId);
  expect(secondError.contexts?.trace?.trace_id).toBe(second.traceId);
});
