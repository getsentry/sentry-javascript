import { PAGELOAD, HTTP_CLIENT } from '@sentry/conventions/op';
import {
  URL_FULL,
  HTTP_REQUEST_REDIRECT_START,
  HTTP_REQUEST_REDIRECT_END,
  HTTP_REQUEST_WORKER_START,
  HTTP_REQUEST_FETCH_START,
  HTTP_REQUEST_DOMAIN_LOOKUP_START,
  HTTP_REQUEST_DOMAIN_LOOKUP_END,
  HTTP_REQUEST_CONNECT_START,
  HTTP_REQUEST_SECURE_CONNECTION_START,
  HTTP_REQUEST_CONNECTION_END,
  HTTP_REQUEST_REQUEST_START,
  HTTP_REQUEST_RESPONSE_START,
  HTTP_REQUEST_RESPONSE_END,
  HTTP_REQUEST_TIME_TO_FIRST_BYTE,
  NETWORK_PROTOCOL_VERSION,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'adds http timing to http.client spans in span streaming mode',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    sentryTest.skip(shouldSkipTracingTest() || !supportedBrowsers.includes(browserName));

    await page.route('http://sentry-test-site.example/*', async route => {
      const request = route.request();
      const postData = await request.postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(Object.assign({ id: 1 }, postData)),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spans = collectStreamedSpans(page);
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === PAGELOAD);
    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    const requestSpans = spans
      .filter(s => getSpanOp(s) === HTTP_CLIENT)
      .sort((a, b) => String(a.attributes[URL_FULL]?.value).localeCompare(String(b.attributes[URL_FULL]?.value)));

    expect(pageloadSpan).toBeDefined();
    expect(requestSpans).toHaveLength(3);

    requestSpans?.forEach((span, index) =>
      expect(span).toMatchObject({
        name: 'GET sentry-test-site.example',
        parent_span_id: pageloadSpan?.span_id,
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        trace_id: pageloadSpan?.trace_id,
        status: 'ok',
        attributes: expect.objectContaining({
          [URL_FULL]: { type: 'string', value: `http://sentry-test-site.example/${index}` },
          [HTTP_REQUEST_REDIRECT_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_REDIRECT_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [HTTP_REQUEST_WORKER_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [HTTP_REQUEST_FETCH_START]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [HTTP_REQUEST_DOMAIN_LOOKUP_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_DOMAIN_LOOKUP_END]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_CONNECT_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_SECURE_CONNECTION_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_CONNECTION_END]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_REQUEST_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_RESPONSE_START]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [HTTP_REQUEST_RESPONSE_END]: { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          [HTTP_REQUEST_TIME_TO_FIRST_BYTE]: {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: expect.any(String) },
        }),
      }),
    );
  },
);
