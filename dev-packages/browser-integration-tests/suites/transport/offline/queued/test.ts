import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

sentryTest('should queue and retry events when they fail to send', async ({ getLocalTestPath, page }) => {
  // makeBrowserOfflineTransport is not included in any CDN bundles
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle')) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

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

  // This will force the page to be reloaded and a new event to be sent
  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url, timeout: 10_000 });

  // Filter out any client reports
  const events = eventData.filter(e => !('discarded_events' in e)) as Event[];

  expect(events).toHaveLength(2);

  // The next two events will be message events starting with 'foo'
  expect(events[0].message?.startsWith('foo'));
  expect(events[1].message?.startsWith('foo'));

  // But because these are two different events, they should have different random numbers in the message
  expect(events[0].message !== events[1].message);
});
