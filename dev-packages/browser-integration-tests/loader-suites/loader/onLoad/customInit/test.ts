import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { LOADER_CONFIGS } from '../../../../utils/generatePlugin';

const bundle = process.env.PW_BUNDLE || '';
const isLazy = LOADER_CONFIGS[bundle]?.lazy;

sentryTest('always calls onLoad init correctly', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  // We want to test that if we are _not_ lazy, we are correctly calling onLoad init()
  // But if we are lazy and call `forceLoad`, we also call the onLoad init() correctly
  if (isLazy) {
    expect(await page.evaluate('window.__sentryOnLoad')).toEqual(0);
    await page.evaluate('Sentry.forceLoad()');
  }

  await page.waitForFunction('window.__sentryOnLoad && window.sentryIsLoaded()');

  expect(await page.evaluate('window.__hadSentry')).toEqual(false);
  expect(await page.evaluate('window.__sentryOnLoad')).toEqual(1);
  expect(await page.evaluate('Sentry.getClient().getOptions().sampleRate')).toEqual(0.5);
});
