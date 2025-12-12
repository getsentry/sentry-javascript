import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipFeatureFlagsTest } from '../../../../../utils/helpers';

sentryTest('Logs and returns if isEnabled does not match expected signature', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest()) {
    sentryTest.skip();
  }
  const bundleKey = process.env.PW_BUNDLE || '';
  const hasDebug = !bundleKey.includes('_min');

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  const errorLogs: string[] = [];
  page.on('console', msg => {
    if (msg.type() == 'error') {
      errorLogs.push(msg.text());
    }
  });

  const results = await page.evaluate(() => {
    const unleash = new (window as any).UnleashClient();
    const res1 = unleash.isEnabled('my-feature');
    const res2 = unleash.isEnabled(999);
    const res3 = unleash.isEnabled({});
    return [res1, res2, res3];
  });

  // Test that the expected results are still returned. Note isEnabled is identity function for this test.
  expect(results).toEqual(['my-feature', 999, {}]);

  // Expected error logs.
  if (hasDebug) {
    expect(errorLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '[Feature Flags] UnleashClient.isEnabled does not match expected signature. arg0: my-feature (string), result: my-feature (string)',
        ),
        expect.stringContaining(
          '[Feature Flags] UnleashClient.isEnabled does not match expected signature. arg0: 999 (number), result: 999 (number)',
        ),
        expect.stringContaining(
          '[Feature Flags] UnleashClient.isEnabled does not match expected signature. arg0: [object Object] (object), result: [object Object] (object)',
        ),
      ]),
    );
  }
});
