import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

import { envelopeRequestParser, shouldSkipFeatureFlagsTest, waitForErrorRequest } from '../../../../../utils/helpers';

const FLAG_BUFFER_SIZE = 100; // Corresponds to constant in featureFlags.ts, in browser utils.

sentryTest('Basic test with eviction, update, and no async tasks', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.evaluate(bufferSize => {
    const flagsIntegration = (window as any).Sentry.getClient().getIntegrationByName('FeatureFlags');
    for (let i = 1; i <= bufferSize; i++) {
      flagsIntegration.setFlag(`feat${i}`, false);
    }
    flagsIntegration.setFlag(`feat${bufferSize + 1}`, true); // eviction
    flagsIntegration.setFlag('feat3', true); // update
    return true;
  }, FLAG_BUFFER_SIZE);

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click(); // trigger error
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  const expectedFlags = [{ flag: 'feat2', result: false }];
  for (let i = 4; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: true });
  expectedFlags.push({ flag: 'feat3', result: true });

  expect(event.contexts?.flags?.values).toEqual(expectedFlags);
});
