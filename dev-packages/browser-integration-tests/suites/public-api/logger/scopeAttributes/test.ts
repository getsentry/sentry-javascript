import { expect } from '@playwright/test';
import type { LogEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipLogsTest,
} from '../../../../utils/helpers';

sentryTest('captures logs with scope attributes', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipLogsTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<LogEnvelope>(page, url, properFullEnvelopeRequestParser);
  const envelopeItems = event[1];

  expect(envelopeItems[0]).toEqual([
    {
      type: 'log',
      item_count: 5,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      items: [
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'log_before_any_scope',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            log_attr: { value: 'log_attr_1', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'log_after_global_scope',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            global_scope_attr: { value: true, type: 'boolean' },
            log_attr: { value: 'log_attr_2', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'log_with_isolation_scope',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            global_scope_attr: { value: true, type: 'boolean' },
            isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
            log_attr: { value: 'log_attr_3', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'log_with_scope',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            global_scope_attr: { value: true, type: 'boolean' },
            isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
            scope_attr: { value: 200, unit: 'millisecond', type: 'integer' },
            log_attr: { value: 'log_attr_4', type: 'string' },
          },
        },
        {
          timestamp: expect.any(Number),
          level: 'info',
          body: 'log_with_scope_2',
          severity_number: 9,
          trace_id: expect.any(String),
          attributes: {
            'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
            'sentry.sdk.version': { value: expect.any(String), type: 'string' },
            global_scope_attr: { value: true, type: 'boolean' },
            isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
            scope_2_attr: { value: 300, unit: 'millisecond', type: 'integer' },
            log_attr: { value: 'log_attr_5', type: 'string' },
          },
        },
      ],
    },
  ]);
});
