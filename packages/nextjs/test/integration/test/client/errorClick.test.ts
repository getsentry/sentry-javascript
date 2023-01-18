import { getMultipleSentryEnvelopeRequests } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Event } from '@sentry/types';

test('should capture error triggered on click', async ({ page }) => {
  await page.goto('/errorClick');

  const [_, events] = await Promise.all([
    page.click('button'),
    getMultipleSentryEnvelopeRequests<Event>(page, 1, { envelopeType: 'event' }),
  ]);

  expect(events[0].exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Sentry Frontend Error',
  });
});
