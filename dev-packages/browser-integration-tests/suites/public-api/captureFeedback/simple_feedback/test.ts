import { expect } from '@playwright/test';
import type { FeedbackEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture simple user feedback', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<FeedbackEvent>(page, url);

  expect(eventData.contexts).toMatchObject(
    expect.objectContaining({
      feedback: {
        contact_email: 'test_email',
        message: 'test_comments',
        name: 'test_name',
      },
    }),
  );
});
