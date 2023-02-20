import { expect } from '@playwright/test';
import { EventType } from '@sentry-internal/rrweb';
import type { RecordingEvent } from '@sentry/replay/build/npm/types/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser } from '../../../utils/helpers';
import { shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should have the correct default privacy settings', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const replayPayload = envelopeRequestParser<RecordingEvent[]>(await reqPromise0, 5);
  const checkoutEvent = replayPayload.find(({ type }) => type === EventType.FullSnapshot);

  expect(JSON.stringify(checkoutEvent?.data, null, 2)).toMatchSnapshot('privacy.json');
});
