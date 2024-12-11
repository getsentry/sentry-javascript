import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should record an extras object', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('multiple_extras');
  expect(eventData.extra).toMatchObject({
    extra_1: [1, ['foo'], 'bar'],
    extra_2: 'baz',
    extra_3: 3.141592653589793,
    extra_4: { qux: { quux: false } },
  });
});
