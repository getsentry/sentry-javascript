import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should reject duplicate, back-to-back errors from captureException', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 7, { url });

  // NOTE: regex because exact error message differs per-browser
  expect(eventData[0].exception?.values?.[0].value).toMatch(/Exception no \d+/);
  expect(eventData[1].exception?.values?.[0].value).toMatch(/Exception no \d+/);
  expect(eventData[2].exception?.values?.[0].value).toEqual('foo');
  // transaction so undefined
  expect(eventData[3].exception?.values?.[0].value).toEqual('created');
  expect(eventData[4].exception?.values?.[0].value).toEqual(undefined);
  expect(eventData[5].exception?.values?.[0].value).toEqual('bar');
  expect(eventData[6].exception?.values?.[0].value).toEqual('bar');
});
