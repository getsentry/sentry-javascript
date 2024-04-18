import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../../utils/helpers';

sentryTest(
  'should NOT catch an exception already caught [but rethrown] via Sentry.captureException',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const events = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

    expect(events[0].exception?.values).toHaveLength(1);
    expect(events[0].exception?.values?.[0]).toMatchObject({
      type: 'ReferenceError',
      value: 'foo is not defined',
      mechanism: {
        type: 'generic',
        handled: true,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    // This is not a refernece error, but another generic error
    expect(events[1].exception?.values).toHaveLength(1);
    expect(events[1].exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'error 2',
      mechanism: {
        type: 'generic',
        handled: true,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });
  },
);
