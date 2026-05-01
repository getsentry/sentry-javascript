import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../utils/helpers';

sentryTest('Should allow importing from @sentry/opentelemetry package', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;

  if (bundle && bundle.includes('bundle')) {
    sentryTest.skip();
    return;
  }

  const consoleMessages: string[] = [];
  page.on('console', msg => {
    consoleMessages.push(msg.text());
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0].value).toBe('test');

  expect(consoleMessages).toContainEqual('SentryAsyncLocalStorageContextManager is not supported in the browser');
});
