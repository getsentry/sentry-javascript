import { expect } from '@playwright/test';
import { sentryTest } from '../../utils/fixtures';
import { envelopeRequestParser } from '../../utils/helpers';

sentryTest('sends event to an IPv6 DSN', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  // Technically, we could also use `waitForErrorRequest` but it listens to every POST request, regardless
  // of URL. Therefore, waiting on the ipv6 URL request, makes the test a bit more robust.
  // We simplify things further by setting up the SDK for errors-only, so that no other request is made.
  const requestPromise = page.waitForRequest(req => req.method() === 'POST' && req.url().includes('[2001:db8::1]'));

  await page.goto(url);

  const errorRequest = envelopeRequestParser(await requestPromise);

  expect(errorRequest.exception?.values?.[0]?.value).toBe('Test error');

  await page.waitForTimeout(1000);
});
