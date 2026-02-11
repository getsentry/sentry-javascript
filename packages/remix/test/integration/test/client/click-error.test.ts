import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report a manually captured message on click with the correct stacktrace.', async ({ page }) => {
  await page.goto('/click-error');

  const promise = getMultipleSentryEnvelopeRequests<Event>(page, 2);
  await page.click('#click-error');

  const envelopes = await promise;

  const [_, errorEnvelope] = envelopes;

  expect(errorEnvelope.level).toBe('error');
  expect(errorEnvelope.sdk?.name).toBe('sentry.javascript.remix');

  expect(errorEnvelope.exception?.values).toMatchObject([
    {
      type: 'Error',
      value: 'ClickError',
      stacktrace: { frames: expect.any(Array) },
      mechanism: { type: 'auto.browser.browserapierrors.addEventListener', handled: false },
    },
  ]);

  // Check the last frame of the stacktrace
  const stacktrace = errorEnvelope.exception?.values[0]?.stacktrace?.frames;

  expect(stacktrace?.[stacktrace.length - 1].function).toBe('onClick');
});
