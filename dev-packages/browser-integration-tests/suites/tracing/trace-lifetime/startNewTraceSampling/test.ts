import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeader, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest(
  'new trace started with `startNewTrace` is sampled according to the `tracesSampler`',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const [pageloadSpan, pageloadTraceHeaders] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    expect(pageloadSpan.is_segment).toBe(true);

    expect(pageloadSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({
        [SENTRY_OP]: { type: 'string', value: 'pageload' },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'double', value: 0.5 },
      }),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(pageloadSpan).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '0.5',
      sampled: 'true',
      trace_id: pageloadSpan?.trace_id,
      sample_rand: '0.45',
    });

    const spanPromise = waitForStreamedSpanAndTraceHeader(page, span => span.name === 'new-trace');

    await page.locator('#newTrace').click();

    const [newTraceSpan, newTraceHeaders] = await spanPromise;

    expect(newTraceSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({
        [SENTRY_OP]: { type: 'string', value: 'ui.interaction.click' },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'double', value: 0.9 },
      }),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(newTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '0.9',
      sampled: 'true',
      trace_id: newTraceSpan?.trace_id,
      transaction: 'new-trace',
      sample_rand: '0.85',
    });

    expect(newTraceSpan?.trace_id).not.toEqual(pageloadSpan?.trace_id);
  },
);
