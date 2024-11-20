import { expect } from '@playwright/test';
import type { Event, UserFeedback } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('capture user feedback when captureException is called', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const data = (await getMultipleSentryEnvelopeRequests(page, 2, { url })) as (Event | UserFeedback)[];

  expect(data).toHaveLength(2);

  const errorEvent = ('exception' in data[0] ? data[0] : data[1]) as Event;
  const feedback = ('exception' in data[0] ? data[1] : data[0]) as UserFeedback;

  expect(feedback).toEqual({
    comments: 'This feedback should be attached associated with the captured error',
    email: 'john@doe.com',
    event_id: errorEvent.event_id,
    name: 'John Doe',
  });
});
