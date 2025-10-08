import { expect } from '@playwright/test';
import type { MetricEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properFullEnvelopeRequestParser } from '../../../../utils/helpers';

sentryTest('should capture all metric types', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  if (bundle.startsWith('bundle') || bundle.startsWith('loader')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<MetricEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'trace_metric',
      item_count: 5,
      content_type: 'application/vnd.sentry.items.trace-metric+json',
    },
    {
      items: [
        {
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          name: 'test.counter',
          type: 'counter',
          value: 1,
          attributes: {
            endpoint: { value: '/api/test', type: 'string' },
            'sentry.release': { value: '1.0.0', type: 'string' },
            'sentry.environment': { value: 'test', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          name: 'test.gauge',
          type: 'gauge',
          unit: 'millisecond',
          value: 42,
          attributes: {
            server: { value: 'test-1', type: 'string' },
            'sentry.release': { value: '1.0.0', type: 'string' },
            'sentry.environment': { value: 'test', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          name: 'test.distribution',
          type: 'distribution',
          unit: 'second',
          value: 200,
          attributes: {
            priority: { value: 'high', type: 'string' },
            'sentry.release': { value: '1.0.0', type: 'string' },
            'sentry.environment': { value: 'test', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          span_id: expect.any(String),
          name: 'test.span.counter',
          type: 'counter',
          value: 1,
          attributes: {
            operation: { value: 'test', type: 'string' },
            'sentry.release': { value: '1.0.0', type: 'string' },
            'sentry.environment': { value: 'test', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          name: 'test.user.counter',
          type: 'counter',
          value: 1,
          attributes: {
            action: { value: 'click', type: 'string' },
            'user.id': { value: 'user-123', type: 'string' },
            'user.email': { value: 'test@example.com', type: 'string' },
            'user.name': { value: 'testuser', type: 'string' },
            'sentry.release': { value: '1.0.0', type: 'string' },
            'sentry.environment': { value: 'test', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
      ],
    },
  ]);
});
