import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

sentryTest('should flush event', async ({ getLocalTestUrl, page }) => {
  // makeBrowserOfflineTransport is not included in any CDN bundles
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // This would be the obvious way to test offline support but it doesn't appear to work!
  // await context.setOffline(true);

  let abortedCount = 0;

  // Abort all envelope requests so the event gets queued
  await page.route(/ingest\.sentry\.io/, route => {
    abortedCount += 1;
    return route.abort();
  });
  await page.goto(url);
  await delay(1_000);
  await page.unroute(/ingest\.sentry\.io/);

  expect(abortedCount).toBe(1);

  // The previous event should now be queued

  // It should get flushed after a few seconds
  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { timeout: 4_000 });

  // Filter out any client reports
  const events = eventData.filter(e => !('discarded_events' in e)) as Event[];

  expect(events).toHaveLength(1);

  // The next two events will be message events starting with 'foo'
  expect(events[0].message?.startsWith('foo'));
});
