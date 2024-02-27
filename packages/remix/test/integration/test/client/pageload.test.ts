const useV2 = process.env.REMIX_VERSION === '2';

import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';

test('should add `pageload` transaction on load.', async ({ page }) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  expect(envelope.contexts?.trace.op).toBe('pageload');
  expect(envelope.type).toBe('transaction');

  expect(envelope.transaction).toBe(useV2 ? 'root' : 'routes/index');
});
