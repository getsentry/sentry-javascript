import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { countEnvelopes, getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('does not capture interaction spans without the integration', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page);

  const countPromise = countEnvelopes(page, { envelopeType: 'transaction', timeout: 2000 });

  await page.locator('[data-test-id=interaction-button]').click();

  expect(await countPromise).toBe(0);
});
