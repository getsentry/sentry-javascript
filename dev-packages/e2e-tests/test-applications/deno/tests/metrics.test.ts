import { expect, test } from '@playwright/test';
import { waitForMetric } from '@sentry-internal/test-utils';

test('Should emit counter, distribution, and gauge metrics', async ({ baseURL }) => {
  const countPromise = waitForMetric('deno', metric => {
    return metric.name === 'test.deno.count';
  });

  const distributionPromise = waitForMetric('deno', metric => {
    return metric.name === 'test.deno.distribution';
  });

  const gaugePromise = waitForMetric('deno', metric => {
    return metric.name === 'test.deno.gauge';
  });

  await fetch(`${baseURL}/test-metrics`);

  const count = await countPromise;
  const distribution = await distributionPromise;
  const gauge = await gaugePromise;

  expect(count).toMatchObject({
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    name: 'test.deno.count',
    type: 'counter',
    value: 1,
    attributes: {
      endpoint: { value: '/test-metrics', type: 'string' },
      'random.attribute': { value: 'Apples', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.deno', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
    },
  });

  expect(distribution).toMatchObject({
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    name: 'test.deno.distribution',
    type: 'distribution',
    value: 100,
    attributes: {
      endpoint: { value: '/test-metrics', type: 'string' },
      'random.attribute': { value: 'Bananas', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.deno', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
    },
  });

  expect(gauge).toMatchObject({
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
    name: 'test.deno.gauge',
    type: 'gauge',
    value: 200,
    attributes: {
      endpoint: { value: '/test-metrics', type: 'string' },
      'random.attribute': { value: 'Cherries', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.deno', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
    },
  });
});
