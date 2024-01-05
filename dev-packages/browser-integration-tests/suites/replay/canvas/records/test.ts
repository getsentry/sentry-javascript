import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('can record canvas', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  const reqPromise2 = waitForReplayRequest(page, 2);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  await reqPromise0;
  await Promise.all([page.click('#draw'), reqPromise1]);

  const { incrementalSnapshots } = getReplayRecordingContent(await reqPromise2);
  // console.log(incrementalSnapshots[0]);
  expect(incrementalSnapshots).toEqual(
    expect.arrayContaining([
      {
        data: {
          commands: [
            {
              args: [0, 0, 150, 150],
              property: 'clearRect',
            },
            {
              args: [
                {
                  args: [
                    {
                      data: [
                        {
                          base64: expect.any(String),
                          rr_type: 'ArrayBuffer',
                        },
                      ],
                      rr_type: 'Blob',
                      // chrome = webp, safari = png
                      type: expect.stringMatching(/webp|png/),
                    },
                  ],
                  rr_type: 'ImageBitmap',
                },
                0,
                0,
              ],
              property: 'drawImage',
            },
          ],
          id: 9,
          source: 9,
          type: 0,
        },
        timestamp: 0,
        type: 3,
      },
    ]),
  );
});
