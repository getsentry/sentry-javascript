import { expect } from '@playwright/test';
import type { OtelLogEnvelope } from '@sentry/core';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properFullEnvelopeRequestParser } from '../../../utils/helpers';

sentryTest('should capture all logging methods', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Get all events from the page
  const event = await getFirstSentryEnvelopeRequest<OtelLogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const [envelopeHeader, envelopeItems] = event;

  expect(envelopeHeader).toEqual({ sdk: { name: 'sentry.javascript.browser', version: expect.any(String) } });

  expect(envelopeItems.length).toBe(14);

  expect(envelopeItems[0]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'trace',
      body: { stringValue: 'test trace' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[1]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'debug',
      body: { stringValue: 'test debug' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 5,
    },
  ]);

  expect(envelopeItems[2]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'info',
      body: { stringValue: 'test info' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[3]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'warn',
      body: { stringValue: 'test warn' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[4]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'error',
      body: { stringValue: 'test error' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[5]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'fatal',
      body: { stringValue: 'test fatal' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[6]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'critical',
      body: { stringValue: 'test critical' },
      attributes: [],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);

  expect(envelopeItems[7]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'trace',
      body: { stringValue: 'test trace stringArg 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s',
          },
        },
        {
          key: 'sentry.message.params.0',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.params.1',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 1,
    },
  ]);
});
