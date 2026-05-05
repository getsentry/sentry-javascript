import { expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { sentryTest, TEST_HOST } from '../../../../utils/fixtures';
import { LOADER_CONFIGS } from '../../../../utils/generatePlugin';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

const bundle = process.env.PW_BUNDLE || '';
const isLazy = LOADER_CONFIGS[bundle]?.lazy;

sentryTest('it does not download the SDK if the SDK was loaded in the meanwhile', async ({ getLocalTestUrl, page }) => {
  // When the loader is eager, this does not work and makes no sense
  if (isLazy !== true) {
    sentryTest.skip();
  }

  let cdnLoadedCount = 0;
  let sentryEventCount = 0;

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    sentryEventCount++;

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const tmpDir = await getLocalTestUrl({ testDir: __dirname, skipRouteHandler: true, skipDsnRouteHandler: true });

  await page.route(`${TEST_HOST}/*.*`, route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname.split('/').pop() || '';

    // Loader + subject both fetch the CDN bundle. Chromium may not hit `page.route` twice for the same URL
    // (memory cache); subject.js uses a cache-busted URL so we reliably observe two network loads.
    if (file === 'cdn.bundle.js') {
      cdnLoadedCount++;
    }

    const filePath = path.resolve(tmpDir, `./${file}`);

    return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
  });

  const url = `${TEST_HOST}/index.html`;

  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  // Still loaded the CDN bundle twice
  await expect.poll(() => cdnLoadedCount, { timeout: 15_000 }).toBe(2);

  // But only sent to Sentry once (`waitForErrorRequest` can resolve before the DSN
  // `page.route` handler increments — poll until the intercept has run)
  await expect.poll(() => sentryEventCount, { timeout: 15_000 }).toBe(1);

  // Ensure loader does not overwrite init/config
  const options = await page.evaluate(() => (window as any).Sentry.getClient()?.getOptions());
  expect(options?.replaysSessionSampleRate).toBe(0.42);

  expect(eventData.exception?.values?.length).toBe(1);
  expect(eventData.exception?.values?.[0]?.value).toBe('window.doSomethingWrong is not a function');
});
