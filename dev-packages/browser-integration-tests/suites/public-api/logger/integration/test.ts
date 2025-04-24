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
      item_count: 7,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      items: [
        {
          timestamp: expect.any(Number),
          level: 'trace',
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
          body: 'Assertion failed: console.assert 123 false',
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
