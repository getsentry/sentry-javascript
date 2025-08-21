import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipFeatureFlagsTest, waitForErrorRequest } from '../../../../../utils/helpers';
import { FLAG_BUFFER_SIZE } from '../../constants';

sentryTest('GrowthBook onError: basic eviction/update and mixed values', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-id' }) });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.evaluate(bufferSize => {
    const gb = new (window as any).GrowthBook();

    gb.__setOn('onTrue', true);
    gb.__setOn('onFalse', false);
    gb.__setFeatureValue('strVal', 'hello');
    gb.__setFeatureValue('numVal', 42);
    gb.__setFeatureValue('objVal', { a: 1, b: 'c' });

    gb.isOn('onTrue');
    gb.isOn('onFalse');
    gb.getFeatureValue('strVal', '');
    gb.getFeatureValue('numVal', 0);
    gb.getFeatureValue('objVal', {});

    for (let i = 1; i <= bufferSize; i++) {
      gb.isOn(`feat${i}`);
    }

    gb.__setOn(`feat${bufferSize + 1}`, true);
    gb.isOn(`feat${bufferSize + 1}`);
    gb.isOn('feat3');
  }, FLAG_BUFFER_SIZE);

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  const values = event.contexts?.flags?.values || [];
  expect(values).toEqual(
    expect.arrayContaining([
      { flag: 'onTrue', result: true },
      { flag: 'onFalse', result: false },
      { flag: 'strVal', result: 'hello' },
      { flag: 'numVal', result: 42 },
      { flag: 'objVal', result: { a: 1, b: 'c' } },
    ]),
  );
});
