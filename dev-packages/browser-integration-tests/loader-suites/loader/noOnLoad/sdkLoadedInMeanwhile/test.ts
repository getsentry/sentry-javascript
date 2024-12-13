import * as fs from 'fs';
import * as path from 'path';
import { expect } from '@playwright/test';

import { TEST_HOST, sentryTest } from '../../../../utils/fixtures';
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

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    sentryEventCount++;

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const tmpDir = await getLocalTestUrl({ testDir: __dirname, skipRouteHandler: true, skipDsnRouteHandler: true });

  await page.route(`${TEST_HOST}/*.*`, route => {
    const file = route.request().url().split('/').pop();

    if (file === 'cdn.bundle.js') {
      cdnLoadedCount++;
    }

    const filePath = path.resolve(tmpDir, `./${file}`);

    return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
  });

  const url = `${TEST_HOST}/index.html`;

  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  await waitForFunction(() => cdnLoadedCount === 2);

  // Still loaded the CDN bundle twice
  expect(cdnLoadedCount).toBe(2);

  // But only sent to Sentry once
  expect(sentryEventCount).toBe(1);

  // Ensure loader does not overwrite init/config
  const options = await page.evaluate(() => (window as any).Sentry.getClient()?.getOptions());
  expect(options?.replaysSessionSampleRate).toBe(0.42);

  expect(eventData.exception?.values?.length).toBe(1);
  expect(eventData.exception?.values?.[0]?.value).toBe('window.doSomethingWrong is not a function');
});

async function waitForFunction(cb: () => boolean, timeout = 2000, increment = 100) {
  while (timeout > 0 && !cb()) {
    await new Promise(resolve => setTimeout(resolve, increment));
    await waitForFunction(cb, timeout - increment, increment);
  }
}
