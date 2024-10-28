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
  async ({ getLocalTestPath, page, browserName, forceFlushReplay }) => {
    // Skipping this in webkit because it is flakey there
    if (shouldSkipReplayTest() || browserName === 'webkit') {
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

    const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });

    await page.goto(url);
    const req0 = await reqPromise0;

    await page.locator('#error').click();
    await forceFlushReplay();
    const req1 = await reqPromise1;

    const event0 = getReplayEvent(req0);

    const event1 = getReplayEvent(req1);
    const content1 = getReplayRecordingContent(req1);

    expect(event0).toEqual(getExpectedReplayEvent());

    expect(event1).toEqual(
      getExpectedReplayEvent({
        segment_id: 1,
        error_ids: [errorEventId],
        urls: [],
      }),
    );

    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#error',
          data: {
            node: {
              attributes: {
                id: 'error',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '***** *****',
            },
            nodeId: expect.any(Number),
          },
        },
      ]),
    );
  },
);

sentryTest(
  '[session-mode] replay event should not contain an error id of a dropped error while recording',
  async ({ getLocalTestPath, page, forceFlushReplay, browserName }) => {
    // Skipping this in webkit because it is flakey there
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    await page.locator('#drop').click();
    await forceFlushReplay();
    const req1 = await reqPromise1;

    const event1 = getReplayEvent(req1);
    const content1 = getReplayRecordingContent(req1);

    expect(event1).toEqual(
      getExpectedReplayEvent({
        segment_id: 1,
        error_ids: [], // <-- no error id
        urls: [],
      }),
    );

    // The button click that triggered the error should still be recorded
    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button#drop',
          data: {
            node: {
              attributes: {
                id: 'drop',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: '***** ***** *** **** **',
            },
            nodeId: expect.any(Number),
          },
        },
      ]),
    );
  },
);
