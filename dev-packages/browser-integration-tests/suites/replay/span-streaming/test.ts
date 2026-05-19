import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getReplaySnapshot, shouldSkipReplayTest, waitForReplayRunning } from '../../../utils/replayHelpers';
import { getSpanOp, waitForStreamedSpanEnvelope } from '../../../utils/spanUtils';

sentryTest(
  'should set correct replay data on streamed spans when replay is active',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipReplayTest() || shouldSkipTracingTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const envelopePromise = waitForStreamedSpanEnvelope(page, envelope => {
      const spans = envelope[1][0][1].items;
      return spans.some(s => getSpanOp(s) === 'pageload');
    });

    await page.goto(url);
    await waitForReplayRunning(page);

    const envelope = await envelopePromise;
    const replay = await getReplaySnapshot(page);

    expect(replay.session?.id).toBeDefined();

    const spans = envelope[1][0][1].items;
    const dsc = envelope[0].trace;
    const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload');

    expect(pageloadSpan).toBeDefined();

    // Span attribute: sentry.replay_id
    expect(pageloadSpan!.attributes?.['sentry.replay_id']).toEqual({
      type: 'string',
      value: replay.session?.id,
    });

    // DSC envelope header: replay_id
    expect(dsc).toEqual(
      expect.objectContaining({
        replay_id: replay.session?.id,
      }),
    );
  },
);
