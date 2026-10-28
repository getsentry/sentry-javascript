import { expect } from '@playwright/test';
import type * as SentryBrowser from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  waitForErrorRequest,
  runScriptInSandbox,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'should capture an error within a sync startSpan callback',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (browserName === 'webkit') {
      // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
      sentryTest.skip();
    }

    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => span.name === 'parent_span');
    const errorPromise = waitForErrorRequest(page);

    await page.goto(url);

    // Force a span envelope to arrive before the error so the error waiter must ignore it.
    const precedingSpanPromise = waitForStreamedSpan(page, span => span.name === 'preceding_span');
    await page.evaluate(async () => {
      const Sentry = (window as typeof window & { Sentry: typeof SentryBrowser }).Sentry;
      Sentry.startSpan({ name: 'preceding_span' }, () => undefined);
      await Sentry.flush();
    });
    await precedingSpanPromise;

    await runScriptInSandbox(page, {
      content: `
      function run() {
        Sentry.startSpan({ name: 'parent_span' }, () => {
          throw new Error('Sync Error');
        });
      }

      setTimeout(run);
      `,
    });

    const [span, errorRequest] = await Promise.all([spanPromise, errorPromise]);
    const err = envelopeRequestParser(errorRequest);

    expect(span.name).toBe('parent_span');
    expect(span.status).toBe('error');
    expect(err?.exception?.values?.[0]?.value).toBe('Sync Error');
  },
);
