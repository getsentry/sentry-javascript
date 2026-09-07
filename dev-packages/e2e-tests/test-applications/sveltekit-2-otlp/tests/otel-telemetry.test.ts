import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { triggerTelemetry, waitForExportedMetric, waitForExportedSpan } from './otlp';

test('keeps exporting the app-owned metrics over OTLP', async ({ baseURL }) => {
  await triggerTelemetry(baseURL as string, '234');

  const metric = await waitForExportedMetric(
    metric => metric.name === 'otlp.test.count' && metric.attributes.id === '234',
    'the metric for id 234',
  );

  expect(metric).toEqual({ name: 'otlp.test.count', value: 1, attributes: { id: '234' } });
});

test('keeps exporting the app-owned spans over OTLP with the DSN-derived auth header', async ({ baseURL }) => {
  const { traceId, spanId } = await triggerTelemetry(baseURL as string, '345');

  const span = await waitForExportedSpan(span => span.spanId === spanId, `the span ${spanId}`);

  expect(span).toEqual({
    sentryAuthHeader: expect.stringMatching(/^Sentry sentry_version=7, sentry_key=\w+$/),
    traceId,
    spanId,
    parentSpanId: expect.stringMatching(/^[a-f0-9]{16}$/),
    name: 'telemetry-handler',
  });
});

test('sends no transactions to Sentry', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('sveltekit-2-otlp', () => true);
  const errorPromise = waitForError('sveltekit-2-otlp', event => {
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
