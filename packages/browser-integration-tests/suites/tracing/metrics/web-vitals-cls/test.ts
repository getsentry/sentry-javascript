import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest('should capture a "GOOD" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getSentryTransactionRequest(page, `${url}#0.05`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeCloseTo(0.05);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p#partial');
});

sentryTest('should capture a "MEH" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getSentryTransactionRequest(page, `${url}#0.21`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeCloseTo(0.21);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p');
});

sentryTest('should capture a "POOR" CLS vital with its source(s).', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getSentryTransactionRequest(page, `${url}#0.35`);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeDefined();
  expect(eventData.measurements?.cls?.value).toBeCloseTo(0.35);
  expect(eventData.tags?.['cls.source.1']).toBe('body > div#content > p');
});
