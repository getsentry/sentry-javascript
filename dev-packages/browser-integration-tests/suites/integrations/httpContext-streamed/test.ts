import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { URL_FULL, USER_AGENT_ORIGINAL } from '@sentry/conventions/attributes';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('httpContextIntegration captures url, user-agent, and referer', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url, { referer: 'https://sentry.io/' });

  const spans = await spansPromise;

  const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload');

  expect(pageloadSpan!.attributes[URL_FULL]).toEqual({ type: 'string', value: expect.any(String) });
  expect(pageloadSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual({
    type: 'string',
    value: expect.any(String),
  });
  expect(pageloadSpan!.attributes['http.request.header.referer']).toEqual({
    type: 'string',
    value: 'https://sentry.io/',
  });
});

sentryTest(
  'httpContextIntegration only attaches the user agent to non-segment spans',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });

    const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => s.name === 'child-span'));

    await page.goto(url, { referer: 'https://sentry.io/' });

    const spans = await spansPromise;

    const childSpan = spans.find(s => s.name === 'child-span');

    expect(childSpan!.is_segment).toBe(false);
    expect(childSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual({ type: 'string', value: expect.any(String) });
    // The document URL and referer only belong on the segment span.
    expect(childSpan!.attributes[URL_FULL]).toBeUndefined();
    expect(childSpan!.attributes['http.request.header.referer']).toBeUndefined();
  },
);
