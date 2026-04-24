import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('httpContextIntegration captures url, user-agent, and referer', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url, { referer: 'https://sentry.io/' });

  const spans = await spansPromise;

  const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload');

  expect(pageloadSpan!.attributes?.['url.full']).toEqual({ type: 'string', value: expect.any(String) });
  expect(pageloadSpan!.attributes?.['http.request.header.user_agent']).toEqual({
    type: 'string',
    value: expect.any(String),
  });
  expect(pageloadSpan!.attributes?.['http.request.header.referer']).toEqual({
    type: 'string',
    value: 'https://sentry.io/',
  });
});
