import { expect } from '@playwright/test';
import { URL_FULL, USER_AGENT_ORIGINAL } from '@sentry/conventions/attributes';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForErrorRequest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('httpContextIntegration captures user-agent and referrer', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = waitForErrorRequest(page);

  // Simulate document.referrer being set to test full functionality of the integration
  await page.goto(url, { referer: 'https://sentry.io/' });

  const errorEvent = envelopeRequestParser(await errorEventPromise);

  expect(errorEvent.exception?.values).toHaveLength(1);

  expect(errorEvent.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
      Referer: 'https://sentry.io/',
    },
    url: expect.any(String),
  });
});

sentryTest('httpContextIntegration captures url, user-agent, and referer', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

  await page.goto(url, { referer: 'https://sentry.io/' });

  const pageloadSpan = await spanPromise;

  expect(pageloadSpan.attributes[URL_FULL]).toEqual({ type: 'string', value: expect.any(String) });
  expect(pageloadSpan.attributes[USER_AGENT_ORIGINAL]).toEqual({
    type: 'string',
    value: expect.any(String),
  });
  expect(pageloadSpan.attributes['http.request.header.referer']).toEqual({
    type: 'array',
    value: ['https://sentry.io/'],
  });
});

sentryTest(
  'httpContextIntegration only attaches the user agent to non-segment spans',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => span.name === 'child-span');

    await page.goto(url, { referer: 'https://sentry.io/' });

    const childSpan = await spanPromise;

    expect(childSpan.is_segment).toBe(false);
    expect(childSpan.attributes[USER_AGENT_ORIGINAL]).toEqual({ type: 'string', value: expect.any(String) });
    // The document URL and referer only belong on the segment span.
    expect(childSpan.attributes[URL_FULL]).toBeUndefined();
    expect(childSpan.attributes['http.request.header.referer']).toBeUndefined();
  },
);
