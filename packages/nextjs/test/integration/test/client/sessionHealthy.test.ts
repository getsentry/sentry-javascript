import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Session } from '@sentry/types';

test('should report healthy sessions', async ({ page }) => {
  const event = await getMultipleSentryEnvelopeRequests<Session>(page, 1, { url: '/healthy', envelopeType: 'session' });

  expect(event[0]).toMatchObject({
    init: true,
    status: 'ok',
    errors: 0,
  });

  expect(await countEnvelopes(page, { url: '/healthy', envelopeType: 'session' })).toBe(1);
});
