import { expect } from '@playwright/test';
import type { LogEnvelope } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properFullEnvelopeRequestParser } from '../../../../utils/helpers';

sentryTest('should capture console object calls', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  // Only run this for npm package exports
  if (bundle.startsWith('bundle') || bundle.startsWith('loader')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<LogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'log',
      item_count: 8,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      items: [
        {
          timestamp: expect.any(Number),
          level: 'trace',
          severity_number: 1,
          trace_id: expect.any(String),
          body: 'console.trace 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'debug',
          severity_number: 5,
          trace_id: expect.any(String),
          body: 'console.debug 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'console.log 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 9,
          trace_id: expect.any(String),
          body: 'console.info 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'warn',
          severity_number: 13,
          trace_id: expect.any(String),
          body: 'console.warn 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          severity_number: 17,
          trace_id: expect.any(String),
          body: 'console.error 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          severity_number: 17,
          trace_id: expect.any(String),
          body: 'Assertion failed: console.assert 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: '',
          attributes: {
            'sentry.origin': { value: 'auto.console.logging', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
      ],
    },
  ]);
});
