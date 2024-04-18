import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should allow to ignore specific urls', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values?.[0].type).toEqual('Error');
  expect(eventData.exception?.values?.[0].value).toEqual('pass');

  const count = await page.evaluate('window._errorCount');
  expect(count).toEqual(1);
});
