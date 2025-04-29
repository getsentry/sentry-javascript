import { expect } from '@playwright/test';
import type { OtelLogEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properFullEnvelopeRequestParser } from '../../../../utils/helpers';

sentryTest('should capture console object calls', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  // Only run this for npm package exports
  if (bundle.startsWith('bundle') || bundle.startsWith('loader')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<OtelLogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'trace',
      body: { stringValue: 'console.trace 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
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
      body: { stringValue: 'console.debug 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
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
      body: { stringValue: 'console.log 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 10,
    },
  ]);

  expect(envelopeItems[3]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'info',
      body: { stringValue: 'console.info 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 9,
    },
  ]);

  expect(envelopeItems[4]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'warn',
      body: { stringValue: 'console.warn 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 13,
    },
  ]);

  expect(envelopeItems[5]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'error',
      body: { stringValue: 'console.error 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 17,
    },
  ]);

  expect(envelopeItems[6]).toEqual([
    {
      type: 'otel_log',
    },
    {
      severityText: 'error',
      body: { stringValue: 'Assertion failed: console.assert 123 false' },
      attributes: [
        {
          key: 'sentry.origin',
          value: {
            stringValue: 'auto.console.logging',
          },
        },
        {
          key: 'sentry.sdk.name',
          value: {
            stringValue: 'sentry.javascript.browser',
          },
        },
        {
          key: 'sentry.sdk.version',
          value: {
            stringValue: expect.any(String),
          },
        },
      ],
      timeUnixNano: expect.any(String),
      traceId: expect.any(String),
      severityNumber: 17,
    },
  ]);
});
