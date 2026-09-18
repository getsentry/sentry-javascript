import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../../utils/helpers';

const SAMPLED_TRACE_ID = '12345678901234567890123456789012';
const UNSAMPLED_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEFERRED_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

// In TwP mode no transactions are emitted, so each variant is observed via the captured error event
// (which carries the continued trace on its `contexts.trace`) and the outgoing request headers.
const VARIANTS = [
  { button: 'sampled', traceId: SAMPLED_TRACE_ID, sampledFlag: '-1' },
  { button: 'unsampled', traceId: UNSAMPLED_TRACE_ID, sampledFlag: '-0' },
  { button: 'deferred', traceId: DEFERRED_TRACE_ID, sampledFlag: '' },
] as const;

for (const variant of VARIANTS) {
  sentryTest(
    `continueTrace continues the ${variant.button} incoming trace in TwP mode`,
    async ({ getLocalTestUrl, page }) => {
      if (shouldSkipTracingTest()) {
        sentryTest.skip();
      }

      const url = await getLocalTestUrl({ testDir: __dirname });

      const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
      await page.route('http://sentry-test-site.example/**', route => {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      });

      await page.goto(url);

      const errorPromise = waitForErrorRequest(page);

      await page.locator(`#${variant.button}`).click();

      const [errorEvent] = eventAndTraceHeaderRequestParser(await errorPromise);
      expect(errorEvent.contexts?.trace?.trace_id).toBe(variant.traceId);

      const outgoingRequest = await outgoingRequestPromise;
      const headers = await outgoingRequest.allHeaders();
      expect(headers['sentry-trace']).toMatch(new RegExp(`^${variant.traceId}-[a-f0-9]{16}${variant.sampledFlag}$`));
    },
  );
}
