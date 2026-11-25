import { expect } from '@playwright/test';
import { IncrementalSource } from '@sentry/rrweb';
import { sentryTest } from '../../../../utils/fixtures';
import { collectReplayRequests, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('records canvas on pages that enforce Trusted Types', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest() || (process.env.PW_BUNDLE || '').startsWith('bundle')) {
    sentryTest.skip();
  }

  await page.addInitScript(() => {
    (window as any)._violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as any)._violations.push(`${event.violatedDirective}: ${event.sample}`);
    });
  });

  const reqPromise0 = waitForReplayRequest(page, 0);

  await page.goto(await getLocalTestUrl({ testDir: __dirname }));
  await reqPromise0;

  const canvasRequestsPromise = collectReplayRequests(page, snapshots =>
    snapshots.some(({ data }) => 'source' in data && data.source === IncrementalSource.CanvasMutation),
  );

  await page.click('#draw');
  await canvasRequestsPromise;

  expect(await page.evaluate(() => (window as any)._violations)).toEqual([]);
});
