import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  collectReplayRequests,
  getReplayBreadcrumbs,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

// Playwright turns the bfcache off, and chrome-headless-shell does not support it
sentryTest.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

// Skip at file level, before the browser starts: other browsers do not accept the `chromium` channel
sentryTest.skip(({ browserName }) => browserName !== 'chromium' || shouldSkipReplayTest());

sentryTest(
  'link click that leaves the page is not a slow click after a bfcache restore',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.route('**/page2.html', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Page 2</body></html>' }),
    );

    // A flush that is still running when the page enters the bfcache can block all later flushes
    await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

    const replayRequestsPromise = collectReplayRequests(page, recordingEvents =>
      getReplayBreadcrumbs(recordingEvents, 'ui.slowClickDetected').some(
        breadcrumb => breadcrumb.message === 'body > button#noopButton',
      ),
    );

    await page.locator('#link').click();
    await page.waitForURL('**/page2.html');
    // A bfcache restore fires no `load` event
    await page.goBack({ waitUntil: 'commit' });

    expect(
      await page.waitForFunction(() => (window as any).restoredFromBfcache !== undefined).then(h => h.jsonValue()),
    ).toBe(true);

    // A slow click that happens after the restore, so we know when the detector has had time to report
    await page.locator('#noopButton').click();

    const { replayRecordingSnapshots } = await replayRequestsPromise;
    const slowClicks = getReplayBreadcrumbs(replayRecordingSnapshots, 'ui.slowClickDetected');

    expect(slowClicks.map(breadcrumb => breadcrumb.message)).toEqual(['body > button#noopButton']);
  },
);
