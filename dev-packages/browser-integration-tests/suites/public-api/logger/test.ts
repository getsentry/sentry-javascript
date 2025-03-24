import { expect } from '@playwright/test';
import type { SerializedOtelLog } from '@sentry/core';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should capture all logging methods', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Get all events from the page
  const events = await Promise.all([
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
    getFirstSentryEnvelopeRequest<SerializedOtelLog>(page, url),
  ]);

  // Verify each log level
  expect(events[0].severityText).toBe('info');
  expect(events[0].body.stringValue).toBe('test info');

  expect(events[1].severityText).toBe('debug');
  expect(events[1].body.stringValue).toBe('test debug');

  expect(events[2].severityText).toBe('warning');
  expect(events[2].body.stringValue).toBe('test warn');

  expect(events[3].severityText).toBe('error');
  expect(events[3].body.stringValue).toBe('test error');

  expect(events[4].severityText).toBe('fatal');
  expect(events[4].body.stringValue).toBe('test fatal');

  expect(events[5].severityText).toBe('critical');
  expect(events[5].body.stringValue).toBe('test critical');
});
