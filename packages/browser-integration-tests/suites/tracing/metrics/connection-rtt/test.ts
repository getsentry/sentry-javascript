import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest.beforeEach(({ browserName }) => {
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }
});

async function createSessionWithLatency(page: Page, latency: number) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: latency,
    downloadThroughput: (25 * 1024) / 8,
    uploadThroughput: (5 * 1024) / 8,
  });

  return session;
}

sentryTest('should capture a `connection.rtt` metric.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.['connection.rtt']?.value).toBe(0);
});

sentryTest(
  'should capture a `connection.rtt` metric with emulated value 200ms on Chromium.',
  async ({ getLocalTestPath, page }) => {
    const session = await createSessionWithLatency(page, 200);

    const url = await getLocalTestPath({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    await session.detach();

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.['connection.rtt']?.value).toBe(200);
  },
);

sentryTest(
  'should capture a `connection.rtt` metric with emulated value 100ms on Chromium.',
  async ({ getLocalTestPath, page }) => {
    const session = await createSessionWithLatency(page, 100);

    const url = await getLocalTestPath({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    await session.detach();

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.['connection.rtt']?.value).toBe(100);
  },
);

sentryTest(
  'should capture a `connection.rtt` metric with emulated value 50ms on Chromium.',
  async ({ getLocalTestPath, page }) => {
    const session = await createSessionWithLatency(page, 50);

    const url = await getLocalTestPath({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    await session.detach();

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.['connection.rtt']?.value).toBe(50);
  },
);
