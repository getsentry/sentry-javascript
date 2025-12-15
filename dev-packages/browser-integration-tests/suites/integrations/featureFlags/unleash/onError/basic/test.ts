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

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.evaluate(bufferSize => {
    const client = new (window as any).UnleashClient();

    client.isEnabled('feat1');
    client.isEnabled('strFeat');
    client.isEnabled('noPayloadFeat');
    client.isEnabled('jsonFeat');
    client.isEnabled('noVariantFeat');
    client.isEnabled('disabledFeat');

    for (let i = 7; i <= bufferSize; i++) {
      client.isEnabled(`feat${i}`);
    }
    client.isEnabled(`feat${bufferSize + 1}`); // eviction
    client.isEnabled('noPayloadFeat'); // update (move to tail)
  }, FLAG_BUFFER_SIZE);

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  const expectedFlags = [{ flag: 'strFeat', result: true }];
  expectedFlags.push({ flag: 'jsonFeat', result: true });
  expectedFlags.push({ flag: 'noVariantFeat', result: true });
  expectedFlags.push({ flag: 'disabledFeat', result: false });
  for (let i = 7; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: false });
  expectedFlags.push({ flag: 'noPayloadFeat', result: true });

  expect(event.contexts?.flags?.values).toEqual(expectedFlags);
});
