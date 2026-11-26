import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForMetric } from '@sentry-internal/test-utils';
import type { SerializedMetricContainer } from '@sentry/core';

test('sends the increase of an Effect counter since the last flush', async ({ baseURL }) => {
  // `Sentry.layerMetrics` reads the Effect metrics every 10 seconds, and this test waits for two reads.
  test.slow();

  const firstMetricPromise = waitForMetric('effect-4-node', metric => metric.name === 'orders_placed');

  await fetch(`${baseURL}/test-metric-counter`);

  expect(await firstMetricPromise).toMatchObject({
    type: 'counter',
    value: 1,
    attributes: { shop: { value: 'e2e', type: 'string' } },
  });

  const secondMetricPromise = waitForMetric('effect-4-node', metric => metric.name === 'orders_placed');

  await fetch(`${baseURL}/test-metric-counter`);

  expect(await secondMetricPromise).toMatchObject({ type: 'counter', value: 1 });
});

test('sends Effect gauges, histograms and frequencies', async ({ baseURL }) => {
  const metricContainerPromise = waitForEnvelopeItem('effect-4-node', envelopeItem => {
    return (
      envelopeItem[0].type === 'trace_metric' &&
      (envelopeItem[1] as SerializedMetricContainer).items.some(metric => metric.name === 'queue_depth')
    );
  });

  await fetch(`${baseURL}/test-metrics`);

  const metrics = ((await metricContainerPromise)[1] as SerializedMetricContainer).items;
  expect(metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'queue_depth', type: 'gauge', value: 7 }),
      expect.objectContaining({ name: 'request_duration_ms.sum', type: 'gauge', value: 200 }),
      expect.objectContaining({ name: 'request_duration_ms.count', type: 'gauge', value: 2 }),
      expect.objectContaining({ name: 'request_duration_ms.min', type: 'gauge', value: 80 }),
      expect.objectContaining({ name: 'request_duration_ms.max', type: 'gauge', value: 120 }),
      expect.objectContaining({
        name: 'cache_lookups',
        type: 'counter',
        value: 2,
        attributes: expect.objectContaining({ word: { value: 'hit', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'cache_lookups',
        type: 'counter',
        value: 1,
        attributes: expect.objectContaining({ word: { value: 'miss', type: 'string' } }),
      }),
    ]),
  );
});

test('sends Effect runtime metrics when they are enabled', async ({ baseURL }) => {
  const metricPromise = waitForMetric('effect-4-node', metric => metric.name === 'child_fibers_started');

  await fetch(`${baseURL}/test-runtime-metrics`);

  expect(await metricPromise).toMatchObject({ type: 'counter', value: 1 });
});
