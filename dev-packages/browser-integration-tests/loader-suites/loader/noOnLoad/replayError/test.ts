import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('should capture a replay & attach an error', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const req = waitForReplayRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  const reqError = await waitForErrorRequestOnUrl(page, url);

  const errorEventData = envelopeRequestParser(reqError);
  expect(errorEventData.exception?.values?.length).toBe(1);
  expect(errorEventData.exception?.values?.[0]?.value).toBe('window.doSomethingWrong is not a function');

  const eventData = getReplayEvent(await req);

  expect(eventData).toBeDefined();
  expect(eventData.segment_id).toBe(0);

  expect(errorEventData.tags?.replayId).toEqual(eventData.replay_id);
});
