import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForError, waitForMetric, waitForRequest } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

interface ExportedTrace {
  traceId: string;
  spanIds: string[];
  sentryAuthHeader?: string;
}

async function waitForExportedTrace(baseURL: string, traceId: string): Promise<ExportedTrace> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${baseURL}/otlp-exported-traces`);
    const exportedTraces = (await response.json()) as ExportedTrace[];

    const match = exportedTraces.find(entry => entry.traceId === traceId);
    if (match) {
      return match;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Trace ${traceId} was never exported over OTLP`);
}

async function triggerTelemetry(baseURL: string, id: string): Promise<{ traceId: string; spanId: string }> {
  const response = await fetch(`${baseURL}/test-telemetry/${id}`);
  return (await response.json()) as { traceId: string; spanId: string };
}

test('attaches the active OpenTelemetry trace to errors', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '123');
  const errorEvent = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: traceId,
    span_id: spanId,
  });
});

test('sends no envelope trace header while riding along on an OpenTelemetry span', async ({ baseURL }) => {
  const envelopePromise = waitForRequest('node-express-otlp', ({ envelope }) => {
    const [, items] = envelope;
    return items.some(
      item =>
        (item[1] as { exception?: { values?: { value?: string }[] } })?.exception?.values?.[0]?.value ===
        'This is an exception with id 567',
    );
  });

  await triggerTelemetry(baseURL as string, '567');
  const { envelope } = await envelopePromise;
  const [envelopeHeaders] = envelope;

  // The Sentry scope's sampling context describes a different trace than the OpenTelemetry one the
  // event is stamped with, so no `trace` header is sent rather than one naming the wrong trace.
  expect((envelopeHeaders as { trace?: unknown }).trace).toBeUndefined();
});

test('attaches the active OpenTelemetry trace to logs', async ({ baseURL }) => {
  const logEnvelopePromise = waitForEnvelopeItem('node-express-otlp', envelope => {
    return (
      envelope[0].type === 'log' &&
      (envelope[1] as SerializedLogContainer).items.some(item => item.body === 'This is a log with id 234')
    );
  });

  const { traceId } = await triggerTelemetry(baseURL as string, '234');
  const logEnvelope = await logEnvelopePromise;

  const log = (logEnvelope[1] as SerializedLogContainer).items.find(item => item.body === 'This is a log with id 234');
  expect(log?.trace_id).toBe(traceId);
});

test('attaches the active OpenTelemetry trace to metrics', async ({ baseURL }) => {
  const metricPromise = waitForMetric('node-express-otlp', metric => {
    return metric.name === 'otlp.test.count' && metric.attributes?.id?.value === '345';
  });

  const { traceId } = await triggerTelemetry(baseURL as string, '345');
  const metric = await metricPromise;

  expect(metric.trace_id).toBe(traceId);
});

test('exports spans over OTLP with the DSN-derived auth header', async ({ baseURL }) => {
  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '456');

  const exportedTrace = await waitForExportedTrace(baseURL as string, traceId);

  expect(exportedTrace.spanIds).toContain(spanId);
  expect(exportedTrace.sentryAuthHeader).toMatch(/^Sentry sentry_version=7, sentry_key=\w+$/);
});
