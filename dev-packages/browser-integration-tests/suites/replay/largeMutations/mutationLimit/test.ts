import { expect } from '@playwright/test';
import { EventType } from '@sentry/rrweb';
import { sentryTest } from '../../../../utils/fixtures';
import {
  collectReplayRequests,
  getReplayBreadcrumbs,
  getReplayRecordingContent,
  getReplaySnapshot,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest(
  'handles large mutations by stopping replay when `mutationLimit` configured',
  async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    // We have to click in order to ensure the LCP is generated, leading to consistent results
    async function gotoPageAndClick() {
      await page.goto(url);
      await page.locator('#noop').click();
    }

    const [res0] = await Promise.all([waitForReplayRequest(page, 0), gotoPageAndClick()]);
    await forceFlushReplay();

    // The `replay.mutations` breadcrumb is added asynchronously (once rrweb's
    // MutationObserver fires) and can land in a different flush than the
    // incremental snapshots and the `ui.click` breadcrumb. Collect across
    // requests until the mutation breadcrumb has arrived rather than betting on
    // a single request containing everything.
    const requestsPromise = collectReplayRequests(
      page,
      recordingSnapshots => getReplayBreadcrumbs(recordingSnapshots, 'replay.mutations').length > 0,
    );

    await page.locator('#button-add').click();
    await forceFlushReplay();

    const { replayRecordingSnapshots } = await requestsPromise;

    // replay should be stopped due to mutation limit
    let replay = await getReplaySnapshot(page);
    expect(replay.session).toBe(undefined);
    expect(replay._isEnabled).toBe(false);

    await page.locator('#button-modify').click();
    await forceFlushReplay();

    await page.locator('#button-remove').click();
    await forceFlushReplay();

    const replayData0 = getReplayRecordingContent(res0);
    expect(replayData0.fullSnapshots.length).toBe(1);

    const fullSnapshots = replayRecordingSnapshots.filter(snapshot => snapshot.type === EventType.FullSnapshot);
    const incrementalSnapshots = replayRecordingSnapshots.filter(
      snapshot => snapshot.type === EventType.IncrementalSnapshot,
    );
    const breadcrumbCategories = getReplayBreadcrumbs(replayRecordingSnapshots)
      .map(({ category }) => category)
      .sort();

    // Breadcrumbs (click and mutation);
    expect(fullSnapshots.length).toBe(0);
    expect(incrementalSnapshots.length).toBeGreaterThan(0);
    expect(breadcrumbCategories).toEqual(['replay.mutations', 'ui.click']);

    replay = await getReplaySnapshot(page);
    expect(replay.session).toBe(undefined);
    expect(replay._isEnabled).toBe(false);
  },
);
