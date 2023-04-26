import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { sentryTest, TEST_HOST } from '../../../../utils/fixtures';
import { LOADER_CONFIGS } from '../../../../utils/generatePage';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';

const bundle = process.env.PW_BUNDLE || '';
const isLazy = LOADER_CONFIGS[bundle]?.lazy;

sentryTest('it does not download the SDK if the SDK was loaded in the meanwhile', async ({ getLocalTestUrl, page }) => {
  // When the loader is eager, this does not work and makes no sense
  if (isLazy !== true) {
    sentryTest.skip();
  }

  let cdnLoadedCount = 0;

  await page.route(`${TEST_HOST}/*.*`, route => {
    const file = route.request().url().split('/').pop();

    if (file === 'cdn.bundle.js') {
      cdnLoadedCount++;
    }

    const filePath = path.resolve(__dirname, `./dist/${file}`);

    return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
  });

  const req = waitForErrorRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname, skipRouteHandler: true });

  await page.goto(url);

  const eventData = envelopeRequestParser(await req);

  expect(eventData.exception?.values?.length).toBe(1);
  expect(eventData.exception?.values?.[0]?.value).toBe('window.doSomethingWrong is not a function');
  expect(cdnLoadedCount).toBe(1);
});
