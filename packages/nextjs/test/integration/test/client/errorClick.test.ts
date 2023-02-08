import { getMultipleSentryEnvelopeRequests } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Event } from '@sentry/types';

test('should capture error triggered on click', async ({ page }) => {
  await page.goto('/errorClick');

  const [, events] = await Promise.all([
    page.click('button'),
    getMultipleSentryEnvelopeRequests<Event>(page, 1, { envelopeType: 'event' }),
  ]);

  expect(events[0].exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Sentry Frontend Error',
  });
});

test('should have a non-url-encoded top frame in route with parameter', async ({ page }) => {
  await page.goto('/some-param/errorClick');

  const [, events] = await Promise.all([
    page.click('button'),
    getMultipleSentryEnvelopeRequests<Event>(page, 1, { envelopeType: 'event' }),
  ]);

  const frames = events[0]?.exception?.values?.[0].stacktrace?.frames;

  expect(frames?.[frames.length - 1].filename).toMatch(/\/\[id\]\/errorClick-[a-f0-9]{20}\.js$/);
});
