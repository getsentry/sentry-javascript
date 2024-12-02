import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should capture unhandledrejection with an object', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'UnhandledRejection',
    value: 'Object captured as promise rejection with keys: a, b, c',
    mechanism: {
      type: 'onunhandledrejection',
      handled: false,
    },
  });
});
