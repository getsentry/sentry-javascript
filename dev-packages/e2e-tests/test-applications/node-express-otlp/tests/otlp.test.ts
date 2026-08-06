import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

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

test('attaches the active OpenTelemetry trace to Sentry errors', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await fetch(`${baseURL}/test-error/123`);
  const { traceId, spanId } = (await response.json()) as { traceId: string; spanId: string };

  const errorEvent = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: traceId,
    span_id: spanId,
  });
});

test('exports spans over OTLP with the DSN-derived auth header', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-error/456`);
  const { traceId, spanId } = (await response.json()) as { traceId: string; spanId: string };

  const exportedTrace = await waitForExportedTrace(baseURL as string, traceId);

  expect(exportedTrace.spanIds).toContain(spanId);
  expect(exportedTrace.sentryAuthHeader).toMatch(/^Sentry sentry_version=7, sentry_key=\w+$/);
});
