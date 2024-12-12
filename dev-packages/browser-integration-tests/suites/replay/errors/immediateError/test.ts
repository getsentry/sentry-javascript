import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';
import { getReplayEvent, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest(
  '[error-mode] should capture error that happens immediately after init',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const req = waitForReplayRequest(page);

    const url = await getLocalTestUrl({ testDir: __dirname });
    const reqError = await waitForErrorRequestOnUrl(page, url);

    const errorEventData = envelopeRequestParser(reqError);
    expect(errorEventData.exception?.values?.length).toBe(1);
    expect(errorEventData.exception?.values?.[0]?.value).toContain('window.doSomethingWrong is not a function');

    const eventData = getReplayEvent(await req);

    expect(eventData).toBeDefined();
    expect(eventData.segment_id).toBe(0);

    expect(errorEventData.tags?.replayId).toEqual(eventData.replay_id);
  },
);
