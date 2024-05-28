import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('Instrumentation should capture errors in setTimeout', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'setTimeout_error',
    mechanism: {
      type: 'instrument',
      handled: false,
      data: {
        function: 'setTimeout',
      },
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
