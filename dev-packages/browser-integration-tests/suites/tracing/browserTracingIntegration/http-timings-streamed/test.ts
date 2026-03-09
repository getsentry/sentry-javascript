import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'adds http timing to http.client spans in span streaming mode',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    sentryTest.skip(shouldSkipTracingTest() || !supportedBrowsers.includes(browserName) || testingCdnBundle());

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

    const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'http.client'));
    await page.goto(url);

    const requestSpans = (await spansPromise).filter(s => getSpanOp(s) === 'http.client');
    const pageloadSpan = (await spansPromise).find(s => getSpanOp(s) === 'pageload');

    expect(pageloadSpan).toBeDefined();
    expect(requestSpans).toHaveLength(3);

    requestSpans?.forEach((span, index) =>
      expect(span).toMatchObject({
        name: `GET http://sentry-test-site.example/${index}`,
        parent_span_id: pageloadSpan?.span_id,
        span_id: expect.stringMatching(/[a-f\d]{16}/),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        trace_id: pageloadSpan?.trace_id,
        status: 'ok',
        attributes: expect.objectContaining({
          'http.request.redirect_start': expect.any(Object),
          'http.request.redirect_end': expect.any(Object),
          'http.request.worker_start': expect.any(Object),
          'http.request.fetch_start': expect.any(Object),
          'http.request.domain_lookup_start': expect.any(Object),
          'http.request.domain_lookup_end': expect.any(Object),
          'http.request.connect_start': expect.any(Object),
          'http.request.secure_connection_start': expect.any(Object),
          'http.request.connection_end': expect.any(Object),
          'http.request.request_start': expect.any(Object),
          'http.request.response_start': expect.any(Object),
          'http.request.response_end': expect.any(Object),
          'http.request.time_to_first_byte': expect.any(Object),
          'network.protocol.version': expect.any(Object),
        }),
      }),
    );
  },
);
