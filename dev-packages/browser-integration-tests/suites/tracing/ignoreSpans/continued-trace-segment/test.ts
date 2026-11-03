import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, waitForTracingHeadersOnUrl } from '../../../../utils/helpers';

sentryTest(
  'ignoring a trace-continued, positively sampled segment span propagates a negative sampling decision when propagating it',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    const tracingHeadersPromise = waitForTracingHeadersOnUrl(page, 'http://sentry-test-external.io');

    await page.goto(url);
    await page.locator('#fetch').click();

    const { baggage, sentryTrace } = await tracingHeadersPromise;
    expect(sentryTrace).toMatch(/12345678901234567890123456789012-[\da-f]{16}-0/);
    expect(baggage).toEqual(
      'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=false,sentry-public_key=public,sentry-sample_rand=0.5',
    );
  },
);
