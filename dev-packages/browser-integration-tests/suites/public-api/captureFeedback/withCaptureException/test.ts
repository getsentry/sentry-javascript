import { expect } from '@playwright/test';
import type { Event, FeedbackEvent } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('capture user feedback when captureException is called', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const data = (await getMultipleSentryEnvelopeRequests(page, 2, { url })) as (Event | FeedbackEvent)[];

  expect(data).toHaveLength(2);

  const errorEvent = ('exception' in data[0] ? data[0] : data[1]) as Event;
  const feedback = ('exception' in data[0] ? data[1] : data[0]) as FeedbackEvent;

  expect(feedback.contexts).toEqual(
    expect.objectContaining({
      feedback: {
        associated_event_id: errorEvent.event_id,
        message: 'This feedback should be attached associated with the captured error',
        contact_email: 'john@doe.com',
        name: 'John Doe',
      },
    }),
  );
});
