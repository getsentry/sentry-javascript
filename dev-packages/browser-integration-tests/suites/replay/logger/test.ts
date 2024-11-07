import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should output logger messages', async ({ getLocalTestPath, page }) => {
  // In minified bundles we do not have logger messages, so we skip the test
  if (shouldSkipReplayTest() || (process.env.PW_BUNDLE || '').includes('_min')) {
    sentryTest.skip();
  }

  const messages: string[] = [];

  page.on('console', message => {
    messages.push(message.text());
  });

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await Promise.all([page.goto(url), reqPromise0]);

  expect(messages).toContain('Sentry Logger [log]: Integration installed: Replay');
  expect(messages).toContain('Sentry Logger [info]: [Replay]  Creating new session');
  expect(messages).toContain('Sentry Logger [info]: [Replay]  Starting replay in session mode');
  expect(messages).toContain('Sentry Logger [info]: [Replay]  Using compression worker');
});
