import { expect, test } from '@playwright/test';
import { Session } from '@sentry/types';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report crashed sessions', async ({ page }) => {
  const event = await getMultipleSentryEnvelopeRequests<Session>(page, 2, { url: '/crashed', envelopeType: 'session' });

  expect(event[0]).toMatchObject({
    init: true,
    status: 'ok',
    errors: 0,
  });

  expect(event[1]).toMatchObject({
    init: false,
    status: 'crashed',
    errors: 1,
  });

  expect(await countEnvelopes(page, { url: '/crashed', envelopeType: 'session' })).toBe(2);
});
