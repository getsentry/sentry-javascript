import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';

sentryTest(
  'adjusts the end timestamp of the root idle span if child spans are ignored',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const eventData = envelopeRequestParser(await pageloadRequestPromise);

    const { start_timestamp: startTimestamp, timestamp: endTimestamp } = eventData;
    const durationSeconds = endTimestamp! - startTimestamp!;

    const spans = eventData.spans || [];

    expect(durationSeconds).toBeGreaterThan(0);
    expect(durationSeconds).toBeLessThan(1.5);

    expect(spans.some(span => span.description === 'take-me')).toBe(true);
    expect(spans.some(span => span.description?.includes('ignore-me'))).toBe(false);
  },
);
