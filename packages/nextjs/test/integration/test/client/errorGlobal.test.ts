import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should capture a globally triggered event', async ({ page }) => {
  const event = await getMultipleSentryEnvelopeRequests<Event>(page, 1, { url: '/crashed', envelopeType: 'event' });

  expect(event[0].exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Crashed',
  });
});
