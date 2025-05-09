import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture a linked error with messages', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(2);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: `This is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be,
this is a very long message that should not be truncated and hopefully won't be`,
    mechanism: {
      type: 'chained',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
  expect(eventData.exception?.values?.[1]).toMatchObject({
    type: 'Error',
    value: `This is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be,
this is a very long message that should not be truncated and won't be`,
    mechanism: {
      type: 'generic',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
