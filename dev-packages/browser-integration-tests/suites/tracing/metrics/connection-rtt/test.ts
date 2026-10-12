import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';
import { NETWORK_CONNECTION_RTT } from '@sentry/conventions/attributes';

sentryTest.beforeEach(({ browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }
});

async function createSessionWithLatency(page: Page, latency: number) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: latency,
    downloadThroughput: (100 * 1024) / 8,
    uploadThroughput: (5 * 1024) / 8,
  });

  return session;
}

sentryTest('captures connection RTT without emulation', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url).then(([span]) => span);

  expect(eventData.attributes[NETWORK_CONNECTION_RTT]?.value).toBe(0);
});

sentryTest('captures connection RTT with emulated value 200ms on Chromium.', async ({ getLocalTestUrl, page }) => {
  const session = await createSessionWithLatency(page, 200);

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url).then(([span]) => span);

  await session.detach();

  expect(eventData.attributes[NETWORK_CONNECTION_RTT]?.value).toBe(200);
});

sentryTest('captures connection RTT with emulated value 100ms on Chromium.', async ({ getLocalTestUrl, page }) => {
  const session = await createSessionWithLatency(page, 100);

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url).then(([span]) => span);

  await session.detach();

  expect(eventData.attributes[NETWORK_CONNECTION_RTT]?.value).toBe(100);
});

sentryTest('captures connection RTT with emulated value 50ms on Chromium.', async ({ getLocalTestUrl, page }) => {
  const session = await createSessionWithLatency(page, 50);

  const url = await getLocalTestUrl({ testDir: __dirname });
  const eventData = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url).then(([span]) => span);

  await session.detach();

  expect(eventData.attributes[NETWORK_CONNECTION_RTT]?.value).toBe(50);
});
