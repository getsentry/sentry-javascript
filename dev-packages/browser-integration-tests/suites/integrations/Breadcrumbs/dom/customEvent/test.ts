import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('breadcrumbs listener should not fail with custom event', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  let error = undefined;
  page.on('pageerror', err => {
    error = err;
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.breadcrumbs).toBeUndefined();
  expect(error).toBeUndefined();
});
