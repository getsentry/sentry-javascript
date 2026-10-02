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
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    const requestSpans = spans
      .filter(s => getSpanOp(s) === 'http.client')
      .sort((a, b) => String(a.attributes['url.full']?.value).localeCompare(String(b.attributes['url.full']?.value)));

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
          'url.full': { type: 'string', value: `http://sentry-test-site.example/${index}` },
          'http.request.redirect_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.redirect_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'http.request.worker_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'http.request.fetch_start': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'http.request.domain_lookup_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.domain_lookup_end': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.connect_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.secure_connection_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.connection_end': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.request_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.response_start': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'http.request.response_end': { type: expect.stringMatching(/^(integer|double)$/), value: expect.any(Number) },
          'http.request.time_to_first_byte': {
            type: expect.stringMatching(/^(integer|double)$/),
            value: expect.any(Number),
          },
          'network.protocol.version': { type: 'string', value: expect.any(String) },
        }),
      }),
    );
  },
);
