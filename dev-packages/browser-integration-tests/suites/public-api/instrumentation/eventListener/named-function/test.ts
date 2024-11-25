import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should capture built-in handlers fn name in mechanism data', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'event_listener_error',
    mechanism: {
      type: 'instrument',
      handled: false,
      data: {
        function: 'addEventListener',
        handler: 'clickHandler',
        target: 'EventTarget',
      },
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
