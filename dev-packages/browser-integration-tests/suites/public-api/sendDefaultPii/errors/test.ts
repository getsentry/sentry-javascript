import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should default user to {{auto}} on errors when sendDefaultPii: true', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(eventData.user?.ip_address).toBe('{{auto}}');
});
