import { expect } from '@playwright/test';
import type { LogEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipLogsTest,
} from '../../../../utils/helpers';

sentryTest('should capture console object calls', async ({ getLocalTestUrl, page }) => {
  // Only run this for npm package exports and CDN bundles with logs
  sentryTest.skip(shouldSkipLogsTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<LogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'log',
      item_count: 15,
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
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.trace {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'debug',
          severity_number: 5,
          trace_id: expect.any(String),
          body: 'console.debug 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.debug {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'console.log 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.log {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 9,
          trace_id: expect.any(String),
          body: 'console.info 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.info {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'warn',
          severity_number: 13,
          trace_id: expect.any(String),
          body: 'console.warn 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.warn {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          severity_number: 17,
          trace_id: expect.any(String),
          body: 'console.error 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'console.error {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 123, type: 'integer' },
            'sentry.message.parameter.1': { value: false, type: 'boolean' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'error',
          severity_number: 17,
          trace_id: expect.any(String),
          body: 'Assertion failed: console.assert 123 false',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'Object: {"key":"value","nested":{"prop":123}}',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'Object: {}', type: 'string' },
            'sentry.message.parameter.0': { value: '{"key":"value","nested":{"prop":123}}', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'Array: [1,2,3,"string"]',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'Array: {}', type: 'string' },
            'sentry.message.parameter.0': { value: '[1,2,3,"string"]', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'Mixed: prefix {"obj":true} [4,5,6] suffix',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'Mixed: {} {} {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 'prefix', type: 'string' },
            'sentry.message.parameter.1': { value: '{"obj":true}', type: 'string' },
            'sentry.message.parameter.2': { value: '[4,5,6]', type: 'string' },
            'sentry.message.parameter.3': { value: 'suffix', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: '',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'String substitution %s %d test 42',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'Object substitution %o {"key":"value"}',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'first 0 1 2',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'first {} {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: 0, type: 'integer' },
            'sentry.message.parameter.1': { value: 1, type: 'integer' },
            'sentry.message.parameter.2': { value: 2, type: 'integer' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          severity_number: 10,
          trace_id: expect.any(String),
          body: 'hello true null undefined',
          attributes: {
            'sentry.origin': { value: 'auto.log.console', type: 'string' },
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            'sentry.message.template': { value: 'hello {} {} {}', type: 'string' },
            'sentry.message.parameter.0': { value: true, type: 'boolean' },
            'sentry.message.parameter.1': { value: 'null', type: 'string' },
            'sentry.message.parameter.2': { value: '', type: 'string' },
          },
        },
      ],
    },
  ]);
});
