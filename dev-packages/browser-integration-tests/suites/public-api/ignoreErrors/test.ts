import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest('should allow to ignore specific errors', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const events = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  expect(events[0].exception?.values?.[0].type).toEqual('Error');
  expect(events[0].exception?.values?.[0].value).toEqual('foo');
  expect(events[1].exception?.values?.[0].type).toEqual('Error');
  expect(events[1].exception?.values?.[0].value).toEqual('bar');

  const count = await page.evaluate('window._errorCount');
  expect(count).toEqual(2);
});
