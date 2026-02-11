import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

// there's no evidence that this actually happens, but it could, and our code correctly
// handles it, so might as well prevent future regression on that score
sentryTest('should capture a random Event with type unhandledrejection', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Event',
    value: 'Event `Event` (type=unhandledrejection) captured as promise rejection',
    mechanism: {
      type: 'auto.browser.global_handlers.onunhandledrejection',
      handled: false,
    },
  });
});
