import { expect, test } from '@playwright/test';
import { Event } from '@sentry/core';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';

test('should add `pageload` transaction on load.', async ({ page }) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  expect(envelope.contexts?.trace.op).toBe('pageload');
  expect(envelope.type).toBe('transaction');

  expect(envelope.transaction).toBe('root');
});
