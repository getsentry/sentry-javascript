import { expect } from '@playwright/test';
import type { OtelLogEnvelope } from '@sentry/core';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properFullEnvelopeRequestParser } from '../../../utils/helpers';

sentryTest('should capture all logging methods', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Get all events from the page
  const event = await getFirstSentryEnvelopeRequest<OtelLogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems.length).toBe(12);

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
      severityNumber: 9,
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
      severityNumber: 13,
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
      severityNumber: 17,
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
      severityNumber: 21,
    },
  ]);

  expect(envelopeItems[6]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'trace',
      body: { stringValue: 'test trace stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'trace',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
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

  expect(envelopeItems[7]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'debug',
      body: { stringValue: 'test debug stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'debug',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 5,
    },
  ]);

  expect(envelopeItems[8]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'info',
      body: { stringValue: 'test info stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'info',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 9,
    },
  ]);

  expect(envelopeItems[9]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'warn',
      body: { stringValue: 'test warn stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'warn',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 13,
    },
  ]);

  expect(envelopeItems[10]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'error',
      body: { stringValue: 'test error stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'error',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 17,
    },
  ]);

  expect(envelopeItems[11]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'fatal',
      body: { stringValue: 'test fatal stringArg false 123' },
      attributes: [
        {
          key: 'sentry.message.template',
          value: {
            stringValue: 'test %s %s %s %s',
          },
        },
        {
          key: 'sentry.message.param.0',
          value: {
            stringValue: 'fatal',
          },
        },
        {
          key: 'sentry.message.param.1',
          value: {
            stringValue: 'stringArg',
          },
        },
        {
          key: 'sentry.message.param.2',
          value: {
            boolValue: false,
          },
        },
        {
          key: 'sentry.message.param.3',
          value: {
            doubleValue: 123,
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 21,
    },
  ]);
});
