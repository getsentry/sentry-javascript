import { expect } from '@playwright/test';
import { IncrementalSource } from '@sentry/rrweb';
import { sentryTest } from '../../../../utils/fixtures';
import type { RecordingSnapshot } from '../../../../utils/replayHelpers';
import {
  collectReplayRequests,
  getReplayRecordingContent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

function isCanvasMutation(snapshot: RecordingSnapshot): boolean {
  return 'source' in snapshot.data && snapshot.data.source === IncrementalSource.CanvasMutation;
}

sentryTest('can record canvas', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit' || (process.env.PW_BUNDLE || '').startsWith('bundle')) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  const content0 = getReplayRecordingContent(await reqPromise0);
  expect(content0.optionsEvents).toEqual([
    {
      tag: 'options',
      payload: expect.objectContaining({
        shouldRecordCanvas: true,
      }),
    },
  ]);

  // The canvas is sampled on a timer, so its snapshot is in the segment of the click or in a later one.
  const canvasRequestsPromise = collectReplayRequests(page, snapshots => snapshots.some(isCanvasMutation));

  await page.click('#draw');

  const { replayRecordingSnapshots } = await canvasRequestsPromise;
  expect(replayRecordingSnapshots).toEqual(
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
