import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest(
  'should reject duplicate, back-to-back messages from captureMessage when it has stacktrace',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 5, { url });

    expect(eventData[0].message).toMatch(/Message no \d+/);
    expect(eventData[1].message).toMatch(/Message no \d+/);
    expect(eventData[2].message).toMatch('same message, same stacktrace');
    expect(eventData[3].message).toMatch('same message, different stacktrace');
    expect(eventData[4].message).toMatch('same message, different stacktrace');
  },
);
