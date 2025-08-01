import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should capture exceptions inside callback', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'requestAnimationFrame_error',
    mechanism: {
      type: 'auto.browser.browserapierrors.requestAnimationFrame',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
