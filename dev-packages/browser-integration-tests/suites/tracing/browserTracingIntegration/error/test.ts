import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  waitForErrorRequest,
  runScriptInSandbox,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'puts the page path onto an error caught during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    // WebKit treats errors from runScriptInSandbox as Script Errors, which Sentry skips.
    sentryTest.skip(shouldSkipTracingTest() || browserName === 'webkit');
    const url = await getLocalTestUrl({ testDir: __dirname });
    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const errorPromise = waitForErrorRequest(page);
    await page.goto(url);
    await runScriptInSandbox(page, { content: "throw new Error('Error during pageload');" });
    const [pageload, errorRequest] = await Promise.all([pageloadPromise, errorPromise]);
    await page.evaluate(() => (window as any).Sentry.flush());
    expect(getSpanOp(pageload)).toBe('pageload');
    expect(spans.filter(span => !span.is_segment)).not.toHaveLength(0);
    const error = envelopeRequestParser<Event>(errorRequest);
    expect(error.exception?.values?.[0]).toBeDefined();
    expect(pageload.name).toBe('Pageload');
    expect(error.transaction).toBe('/index.html');
    expect(error.transaction).toBe(pageload.attributes['url.path']?.value);
  },
);
