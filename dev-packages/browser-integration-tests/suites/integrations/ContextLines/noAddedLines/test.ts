import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('should not add source context lines to errors from script files', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventReqPromise = waitForErrorRequestOnUrl(page, url);
  await page.waitForFunction('window.Sentry');

  const clickPromise = page.locator('#script-error-btn').click();

  const [req] = await Promise.all([eventReqPromise, clickPromise]);

  const eventData = envelopeRequestParser(req);

  const exception = eventData.exception?.values?.[0];
  const frames = exception?.stacktrace?.frames;
  expect(frames).toHaveLength(1);
  frames?.forEach(f => {
    expect(f).not.toHaveProperty('pre_context');
    expect(f).not.toHaveProperty('context_line');
    expect(f).not.toHaveProperty('post_context');
  });
});
