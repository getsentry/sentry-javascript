import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { countEnvelopes } from '../../../../utils/helpers';

sentryTest('drops error events when sampleRate is the string "0"', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const errorCountPromise = countEnvelopes(page, { envelopeType: 'event', timeout: 2000 });

  await page.goto(url);
  await page.waitForFunction('window._testDone');
  await page.evaluate('window.Sentry.getClient().flush()');

  expect(await errorCountPromise).toBe(0);
});
