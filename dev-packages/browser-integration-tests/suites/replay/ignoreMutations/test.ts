import { expect } from '@playwright/test';
import type { mutationData } from '@sentry-internal/rrweb-types';
import { sentryTest } from '../../../utils/fixtures';
import type { RecordingSnapshot } from '../../../utils/replayHelpers';
import { collectReplayRequests, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('allows to ignore mutations via `ignoreMutations` option', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const reqPromise0 = waitForReplayRequest(page, 0);

  await page.goto(url);
  await reqPromise0;

  const requestsPromise = collectReplayRequests(page, recordingEvents => {
    const events = recordingEvents as (RecordingSnapshot & { data: mutationData })[];
    return events.some(event => event.data.attributes?.some(attr => attr.attributes['class'] === 'moved'));
  });

  page.locator('#button-move').click();

  const requests = await requestsPromise;

  // All transform mutatinos are ignored and not captured
  const transformMutations = requests.replayRecordingSnapshots.filter(item =>
    (item.data as mutationData)?.attributes?.some(
      attr => attr.attributes['style'] && attr.attributes['class'] !== 'moved',
    ),
  );

  // Should capture the final class mutation
  const classMutations = requests.replayRecordingSnapshots.filter(item =>
    (item.data as mutationData)?.attributes?.some(attr => attr.attributes['class']),
  );

  expect(transformMutations).toEqual([]);
  expect(classMutations).toEqual([
    {
      data: {
        adds: [],
        attributes: [
          {
            attributes: {
              class: 'moved',
              style: {
                transform: 'translate(0px, 0px)',
              },
            },
            id: expect.any(Number),
          },
        ],
        removes: [],
        source: expect.any(Number),
        texts: [],
      },
      timestamp: 0,
      type: 3,
    },
  ]);
});
