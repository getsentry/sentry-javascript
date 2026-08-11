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
  const errorEventPromise = waitForError('nextjs-custom-otel', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '123');
  const errorEvent = await errorEventPromise;

  // `setupEventContextTrace` sets the trace context on `preprocessEvent`, which the final context
  // merge keeps, so it also carries the Next.js span this handler ran under as `parent_span_id`.
  expect(errorEvent.contexts?.trace).toMatchObject({ trace_id: traceId, span_id: spanId });
});

test('keeps exporting the app-owned metrics over OTLP', async ({ baseURL }) => {
  await triggerTelemetry(baseURL as string, '234');

  const metric = await waitForExportedMetric('234');

  expect(metric).toEqual({ name: 'otlp.test.count', value: 1, attributes: { id: '234' } });
});

test('keeps exporting the app-owned spans over OTLP', async ({ baseURL }) => {
  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '345');

  const span = await waitForExportedSpan(spanId);

  expect(span).toEqual({ traceId, spanId, name: 'telemetry-handler' });
});

test('sends no transactions to Sentry', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('nextjs-custom-otel', () => true);
  const errorPromise = waitForError('nextjs-custom-otel', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception with id 456';
  });

  await triggerTelemetry(baseURL as string, '456');
  // Proves the request's telemetry reached the proxy, so the absence check below is not vacuous.
  await errorPromise;

  // Absence can only be time bounded. This guards against Sentry's tracing defaults changing under
  // the app, which would emit a transaction for every request, well inside this window.
  const transaction = await Promise.race([
    transactionPromise,
    new Promise(resolve => setTimeout(() => resolve(undefined), 3000)),
  ]);

  expect(transaction).toBeUndefined();
});

test('keeps concurrent requests on separate traces', async ({ baseURL }) => {
  const errorEventPromises = ['567', '678'].map(id =>
    waitForError('nextjs-custom-otel', event => {
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
