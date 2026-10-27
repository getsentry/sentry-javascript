import { SENTRY_ORIGIN, SENTRY_OP, URL_DOMAIN } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest(
  'sends http.client span for fetch requests without an active span with default span streaming',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/api/test', route => {
      route.fulfill({
        status: 200,
        body: 'ok',
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');

    await page.goto(url);

    const span = await spanPromise;

    expect(span.is_segment).toBe(true);
    expect(span).not.toHaveProperty('parent_span_id');
    expect(span.name).toBe('GET sentry-test-site.example');
    expect(span.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.http.browser' });
    expect(span.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'http.client' });
    expect(span.attributes[URL_DOMAIN]).toEqual({ type: 'string', value: 'sentry-test-site.example' });
  },
);
