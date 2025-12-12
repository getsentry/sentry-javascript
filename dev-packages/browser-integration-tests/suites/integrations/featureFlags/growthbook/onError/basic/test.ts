import { expect } from '@playwright/test';
import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipFeatureFlagsTest,
  waitForErrorRequest,
} from '../../../../../../utils/helpers';

sentryTest('GrowthBook onError: basic eviction/update and no async tasks', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest()) {
    sentryTest.skip();
  }

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-id' }) });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.evaluate(bufferSize => {
    const gb = new (window as any).GrowthBook();

    for (let i = 1; i <= bufferSize; i++) {
      gb.isOn(`feat${i}`);
    }

    gb.__setOn(`feat${bufferSize + 1}`, true);
    gb.isOn(`feat${bufferSize + 1}`); // eviction

    gb.__setOn('feat3', true);
    gb.isOn('feat3'); // update

    // Test getFeatureValue with boolean values (should be captured)
    gb.__setFeatureValue('bool-feat', true);
    gb.getFeatureValue('bool-feat', false);

    // Test getFeatureValue with non-boolean values (should be ignored)
    gb.__setFeatureValue('string-feat', 'hello');
    gb.getFeatureValue('string-feat', 'default');
    gb.__setFeatureValue('number-feat', 42);
    gb.getFeatureValue('number-feat', 0);
  }, FLAG_BUFFER_SIZE);

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  const values = event.contexts?.flags?.values || [];

  // After the sequence of operations:
  // 1. feat1-feat100 are added (100 items)
  // 2. feat101 is added, evicts feat1 (100 items: feat2-feat100, feat101)
  // 3. feat3 is updated to true, moves to end (100 items: feat2, feat4-feat100, feat101, feat3)
  // 4. bool-feat is added, evicts feat2 (100 items: feat4-feat100, feat101, feat3, bool-feat)

  const expectedFlags = [];
  for (let i = 4; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: true });
  expectedFlags.push({ flag: 'feat3', result: true });
  expectedFlags.push({ flag: 'bool-feat', result: true }); // Only boolean getFeatureValue should be captured

  expect(values).toEqual(expectedFlags);
});
