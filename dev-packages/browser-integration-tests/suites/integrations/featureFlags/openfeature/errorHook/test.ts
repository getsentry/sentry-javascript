import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

import { envelopeRequestParser, shouldSkipFeatureFlagsTest, waitForErrorRequest } from '../../../../../utils/helpers';

const FLAG_BUFFER_SIZE = 100; // Corresponds to constant in featureFlags.ts, in browser utils.

sentryTest('Flag evaluation error hook', async ({ getLocalTestUrl, page }) => {
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
    const client = (window as any).initialize();
    for (let i = 1; i <= bufferSize; i++) {
      client.getBooleanValue(`feat${i}`, false);
    }
    client.getBooleanValue(`feat${bufferSize + 1}`, true); // eviction
    client.getBooleanValue('feat3', true); // update
  }, FLAG_BUFFER_SIZE);

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  // Default value is mocked as false -- these will all error and use default
  // value
  const expectedFlags = [{ flag: 'feat2', result: false }];
  for (let i = 4; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: false });
  expectedFlags.push({ flag: 'feat3', result: false });

  expect(event.contexts?.flags?.values).toEqual(expectedFlags);
});
