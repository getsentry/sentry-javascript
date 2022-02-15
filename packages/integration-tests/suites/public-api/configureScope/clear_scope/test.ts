import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should clear previously set properties of a scope', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  // TODO: This is to compensate for a temporary debugging hack which adds data the tests aren't anticipating to the
  // event. The code can be restored to its original form (the commented-out line below) once that hack is
  // removed. See https://github.com/getsentry/sentry-javascript/pull/4425 and
  // https://github.com/getsentry/sentry-javascript/pull/4574
  if (eventData.extra) {
    if (Object.keys(eventData.extra).length === 1) {
      delete eventData.extra;
    } else {
      delete eventData.extra.normalizeDepth;
    }
  }

  expect(eventData.message).toBe('cleared_scope');
  expect(eventData.user).toBeUndefined();
  expect(eventData.tags).toBeUndefined();
  expect(eventData.extra).toBeUndefined();
});
