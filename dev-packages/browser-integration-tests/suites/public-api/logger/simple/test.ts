import { expect } from '@playwright/test';
import type { LogEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipLogsTest,
} from '../../../../utils/helpers';

sentryTest('should capture all logging methods', async ({ getLocalTestUrl, page }) => {
  // Only run this for npm package exports and CDN bundles with logs
  sentryTest.skip(shouldSkipLogsTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<LogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'log',
      item_count: 12,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      items: [
        {
          timestamp: expect.any(Number),
          level: 'trace',
          body: 'test trace',
          severity_number: 1,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'debug',
          body: 'test debug',
          severity_number: 5,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'test info',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'warn',
          body: 'test warn',
          severity_number: 13,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          body: 'test error',
          severity_number: 17,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'fatal',
          body: 'test fatal',
          severity_number: 21,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'trace',
          body: 'test trace stringArg false 123',
          severity_number: 1,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'trace', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'debug',
          body: 'test debug stringArg false 123',
          severity_number: 5,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'debug', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'test info stringArg false 123',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'info', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'warn',
          body: 'test warn stringArg false 123',
          severity_number: 13,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'warn', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          body: 'test error stringArg false 123',
          severity_number: 17,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'error', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'fatal',
          body: 'test fatal stringArg false 123',
          severity_number: 21,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'test %s %s %s %s', type: 'string' },
            'sentry.message.parameter.0': { value: 'fatal', type: 'string' },
            'sentry.message.parameter.1': { value: 'stringArg', type: 'string' },
            'sentry.message.parameter.2': { value: false, type: 'boolean' },
            'sentry.message.parameter.3': { value: 123, type: 'integer' },
          },
        },
      ],
    },
  ]);
});
