import { expect } from '@playwright/test';
import type { UserFeedback } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture simple user feedback', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<UserFeedback>(page, url);

  expect(eventData).toMatchObject({
    eventId: 'test_event_id',
    email: 'test_email',
    comments: 'test_comments',
    name: 'test_name',
  });
});
