import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser } from '../../../../utils/helpers';
import { expectedClickBreadcrumb, getExpectedReplayEvent } from '../../../../utils/replayEventTemplates';
import {
  getReplayEvent,
  getReplayRecordingContent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest(
  '[session-mode] replay event should contain an error id of an error that occurred during session recording',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    let errorEventId: string = 'invalid_id';

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      const event = envelopeRequestParser(route.request());
      // error events have no type field
      if (event && !event.type && event.event_id) {
        errorEventId = event.event_id;
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await page.click('#go-background');
    const req0 = await reqPromise0;

    await page.click('#error');
    await page.click('#go-background');
    const req1 = await reqPromise1;

    const event0 = getReplayEvent(req0);
    const content0 = getReplayRecordingContent(req0);

    const event1 = getReplayEvent(req1);
    const content1 = getReplayRecordingContent(req1);

    expect(event0).toEqual(getExpectedReplayEvent());

    // The first event should have both, full and incremental snapshots,
    // as we recorded and kept all events in the buffer
    expect(content0.fullSnapshots).toHaveLength(1);
    expect(content0.incrementalSnapshots).toHaveLength(0);

    expect(event1).toEqual(
      getExpectedReplayEvent({
        replay_start_timestamp: undefined,
        segment_id: 1,
        // @ts-ignore this is fine
        error_ids: [errorEventId],
        urls: [],
      }),
    );

    // Also the second snapshot should have a full snapshot, as we switched from error to session
    // mode which triggers another checkout
    expect(content1.fullSnapshots).toHaveLength(0);
    expect(content1.breadcrumbs).toEqual(expect.arrayContaining([expectedClickBreadcrumb]));
  },
);
