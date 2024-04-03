import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture a linked error with messages', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(2);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: `This is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,
this is a very long message that should be truncated and hopefully will be,
this is a very long me...`,
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
    value: `This is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be,
this is a very long message that should be truncated and will be,
this is a very long message that should be truncated...`,
    mechanism: {
      type: 'generic',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
