import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipFeedbackTest } from '../../../utils/helpers';

/**
 * This test is mostly relevant for ensuring that the logger works in all combinations of CDN bundles.
 * Even if feedback is included via the CDN, this test ensures that the logger is working correctly.
 */
sentryTest('should log error correctly', async ({ getLocalTestUrl, page }) => {
  // In minified bundles we do not have logger messages, so we skip the test
  if (shouldSkipFeedbackTest() || (process.env.PW_BUNDLE || '').includes('_min')) {
    sentryTest.skip();
  }

  const messages: string[] = [];

  page.on('console', message => {
    messages.push(message.text());
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  expect(messages).toContain('Sentry Logger [log]: Integration installed: Feedback');
  expect(messages).toContain('Sentry Logger [error]: [Feedback] Unable to attach to target element');
});
