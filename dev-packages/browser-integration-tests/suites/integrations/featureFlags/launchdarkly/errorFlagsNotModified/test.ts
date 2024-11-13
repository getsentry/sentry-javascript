import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';

sentryTest('Flags on error event are not affected by later evaluations', async ({ getLocalTestPath, page }) => {
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  // initial evals
  await page.waitForFunction(() => {
    const ldClient = (window as any).initializeLD();
    ldClient.variation('hello', true);
    ldClient.variation('world', false);
    return true;
  });

  // trigger error
  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  // more evals
  await page.waitForFunction(() => {
    const ldClient = (window as any).ldClient;
    ldClient.variation('goodbye', false);
    ldClient.variation('hello', false);
    return true;
  });

  const expectedFlags = [
    { flag: 'hello', result: true },
    { flag: 'world', result: false },
  ];
  expect(event.contexts?.flags?.values).toEqual(expectedFlags);
});
