import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const OTLP_RECEIVER_URL = 'http://localhost:3033';

interface CollectedSpan {
  traceId: string;
  spanId: string;
  name: string;
}

interface CollectedMetric {
  name: string;
  value: number;
  attributes: Record<string, string>;
}

async function triggerTelemetry(baseURL: string, id: string): Promise<{ traceId: string; spanId: string }> {
  const response = await fetch(`${baseURL}/api/telemetry/${id}`);
  return (await response.json()) as { traceId: string; spanId: string };
}

interface Collected {
  spans: CollectedSpan[];
  metrics: CollectedMetric[];
}

async function waitForCollected<T>(select: (collected: Collected) => T | undefined, description: string): Promise<T> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${OTLP_RECEIVER_URL}/collected`);
    const collected = (await response.json()) as Collected;

    const match = select(collected);
    if (match !== undefined) {
      return match;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${description} to be exported over OTLP`);
}

const waitForExportedMetric = (id: string): Promise<CollectedMetric> =>
  waitForCollected(
    ({ metrics }) => metrics.find(metric => metric.name === 'otlp.test.count' && metric.attributes.id === id),
    `the metric for id ${id}`,
  );

const waitForExportedSpan = (spanId: string): Promise<CollectedSpan> =>
  waitForCollected(({ spans }) => spans.find(span => span.spanId === spanId), `the span ${spanId}`);

test('stamps errors with the trace of the active OpenTelemetry span', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '123');
  const errorEvent = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toEqual({ trace_id: traceId, span_id: spanId });
});

test('connects the exported metric and the error through one trace id', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 234';
  });

  await triggerTelemetry(baseURL as string, '234');

  const [errorEvent, metric] = await Promise.all([errorEventPromise, waitForExportedMetric('234')]);

  expect(metric.attributes['trace.id']).toBe(errorEvent.contexts?.trace?.trace_id);
});

test('keeps exporting the app-owned spans over OTLP', async ({ baseURL }) => {
  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '345');

  const span = await waitForExportedSpan(spanId);

  expect(span).toEqual({ traceId, spanId, name: 'telemetry-handler' });
});

test('sends no transactions to Sentry', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('nextjs-otlp', () => true).then(() => 'transaction');
  // The second request's error fences the first request's telemetry: anything Sentry sent for
  // request 456, transaction included, is queued on the transport before it.
  const fenceErrorPromise = waitForError('nextjs-otlp', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 457';
  }).then(() => 'fence');

  await triggerTelemetry(baseURL as string, '456');
  await triggerTelemetry(baseURL as string, '457');

  expect(await Promise.race([transactionPromise, fenceErrorPromise])).toBe('fence');
});

test('keeps concurrent requests on separate traces', async ({ baseURL }) => {
  const errorEventPromises = ['567', '678'].map(id =>
    waitForError('nextjs-otlp', event => {
      return event.exception?.values?.[0]?.value === `This is an exception with id ${id}`;
    }),
  );

  await Promise.all([triggerTelemetry(baseURL as string, '567'), triggerTelemetry(baseURL as string, '678')]);

  const [firstError, secondError] = await Promise.all(errorEventPromises);
  const [firstMetric, secondMetric] = await Promise.all([waitForExportedMetric('567'), waitForExportedMetric('678')]);

  expect(firstError.contexts?.trace?.trace_id).not.toBe(secondError.contexts?.trace?.trace_id);
  expect(firstMetric.attributes['trace.id']).toBe(firstError.contexts?.trace?.trace_id);
  expect(secondMetric.attributes['trace.id']).toBe(secondError.contexts?.trace?.trace_id);
});
