import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest('captures 0 CLS if the browser supports reporting CLS', async ({ getLocalTestPath, page, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transactionEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transactionEvent.measurements).toBeDefined();
  expect(transactionEvent.measurements?.cls?.value).toBe(0);

  // but no source entry (no source if there is no layout shift)
  expect(transactionEvent.contexts?.trace?.data?.['cls.source.1']).toBeUndefined();
});

sentryTest(
  "doesn't capture 0 CLS if the browser doesn't support reporting CLS",
  async ({ getLocalTestPath, page, browserName }) => {
    if (shouldSkipTracingTest() || browserName === 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    const transactionEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#no-cls`);

    expect(transactionEvent.measurements).toBeDefined();
    expect(transactionEvent.measurements?.cls).toBeUndefined();

    expect(transactionEvent.contexts?.trace?.data?.['cls.source.1']).toBeUndefined();
  },
);
