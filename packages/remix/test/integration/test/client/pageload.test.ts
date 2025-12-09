import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';

test('should add `pageload` transaction on load.', async ({ page }) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  expect(envelope.contexts?.trace.op).toBe('pageload');
  expect(envelope.type).toBe('transaction');

  // Static root route should use '/' (URL) since it doesn't need parameterization
  expect(envelope.transaction).toBe('/');
  expect(envelope.contexts?.trace?.data?.['sentry.source']).toBe('url');
});
