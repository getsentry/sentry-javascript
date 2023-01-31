import { expect } from '@playwright/test';
import type { RecordingEvent } from '@sentry/replay/build/npm/types/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser } from '../../../utils/helpers';
import { getReplayBreadcrumbs, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('adds a start recording breadcrumb to the replay', async ({ getLocalTestPath, page }) => {
  // Replay bundles are es6 only
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  const reqPromise = waitForReplayRequest(page, 0);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const replayRecording = envelopeRequestParser(await reqPromise, 5) as RecordingEvent[];
  const breadCrumbs = getReplayBreadcrumbs(replayRecording, 'replay.recording.start');

  expect(breadCrumbs.length).toBe(1);
  expect(breadCrumbs[0]).toEqual({
    category: 'replay.recording.start',
    data: {
      url: expect.stringContaining('replay/startRecordingBreadcrumb/dist/index.html'),
    },
    timestamp: expect.any(Number),
    type: 'default',
  });
});
