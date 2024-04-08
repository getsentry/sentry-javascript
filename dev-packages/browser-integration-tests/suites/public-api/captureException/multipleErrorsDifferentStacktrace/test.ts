import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should not reject back-to-back errors with different stack traces', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });

  // NOTE: regex because exact error message differs per-browser
  expect(eventData[0].exception?.values?.[0].value).toMatch(/baz/);
  expect(eventData[0].exception?.values?.[0].type).toMatch('ReferenceError');
  expect(eventData[1].exception?.values?.[0].value).toMatch(/baz/);
  expect(eventData[1].exception?.values?.[0].type).toMatch('ReferenceError');
  expect(eventData[2].exception?.values?.[0].value).toMatch(/baz/);
  expect(eventData[2].exception?.values?.[0].type).toMatch('ReferenceError');
});
