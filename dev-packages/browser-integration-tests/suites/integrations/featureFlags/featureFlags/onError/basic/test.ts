import { expect } from '@playwright/test';
import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipFeatureFlagsTest,
  waitForErrorRequest,
} from '../../../../../../utils/helpers';

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
      flagsIntegration.addFeatureFlag(`feat${i}`, false);
    }
    flagsIntegration.addFeatureFlag(`feat${bufferSize + 1}`, true); // eviction
    flagsIntegration.addFeatureFlag('feat3', true); // update
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
