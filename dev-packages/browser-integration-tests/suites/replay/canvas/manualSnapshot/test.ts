import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('can manually snapshot canvas', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit' || (process.env.PW_BUNDLE || '').startsWith('bundle')) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  const reqPromise2 = waitForReplayRequest(page, 2);
  const reqPromise3 = waitForReplayRequest(page, 3);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  await Promise.all([page.click('#draw'), reqPromise1]);

  const { incrementalSnapshots } = getReplayRecordingContent(await reqPromise2);
  expect(incrementalSnapshots).toEqual([]);

  await page.evaluate(() => {
    (window as any).Sentry.getClient().getIntegrationByName('ReplayCanvas').snapshot();
  });

  const { incrementalSnapshots: incrementalSnapshotsManual } = getReplayRecordingContent(await reqPromise3);
  expect(incrementalSnapshotsManual).toEqual(
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
                      type: 'image/webp',
                    },
                  ],
                  rr_type: 'ImageBitmap',
                },
                0,
                0,
                150,
                150,
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
