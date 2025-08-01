import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('Instrumentation should capture errors in setInterval', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'setInterval_error',
    mechanism: {
      type: 'auto.browser.browserapierrors.setInterval',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
