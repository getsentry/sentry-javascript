import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getExpectedReplayEvent } from '../../../../utils/replayEventTemplates';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

/*
 * This scenario currently shows somewhat unexpected behavior from the PoV of a user:
 * The error is dropped, but the recording is started and continued anyway.
 * If folks only sample error replays, this will lead to a lot of confusion as the resulting replay
 * won't contain the error that started it (possibly none or only additional errors that occurred later on).
 *
 * This is because in error-mode, we start recording as soon as replay's eventProcessor is called with an error.
 * If later event processors or beforeSend drop the error, the recording is already started.
 *
 * We'll need a proper SDK lifecycle hook (WIP) to fix this properly.
 * TODO: Once we have lifecycle hooks, we should revisit this test and make sure it behaves as expected.
 *       This means that the recording should not be started or stopped if the error that triggered it is not sent.
 */
for (let i = 0; i < 100; i++) {
  sentryTest(
    `[error-mode] should start recording if an error occurred although the error was dropped RUN ${i}`,
    async ({ getLocalTestPath, page }) => {
      if (shouldSkipReplayTest()) {
        sentryTest.skip();
      }

      let callsToSentry = 0;
      const reqPromise0 = waitForReplayRequest(page, 0);
      const reqPromise1 = waitForReplayRequest(page, 1);

      await page.route('https://dsn.ingest.sentry.io/**/*', route => {
        callsToSentry++;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'test-id' }),
        });
      });

      const url = await getLocalTestPath({ testDir: __dirname });

      await page.goto(url);
      await page.click('#go-background');
      expect(callsToSentry).toEqual(0);

      await page.click('#error');
      const req0 = await reqPromise0;

      await page.click('#go-background');
      await reqPromise1;

      expect(callsToSentry).toEqual(2); // 2 replay events

      await page.click('#log');
      await page.click('#go-background');

      const event0 = getReplayEvent(req0);

      expect(event0).toEqual(
        getExpectedReplayEvent({
          contexts: { replay: { error_sample_rate: 1, session_sample_rate: 0 } },
          // This is by design. A dropped error shouldn't be in this list.
          error_ids: [],
          replay_type: 'error',
        }),
      );
    },
  );
}
