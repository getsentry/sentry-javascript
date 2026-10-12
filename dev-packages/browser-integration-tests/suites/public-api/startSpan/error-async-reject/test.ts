import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest, shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'should capture a promise rejection within an async startSpan callback',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const spanPromise = waitForStreamedSpan(page, span => span.name === 'parent_span');
    const errorPromise = waitForErrorRequest(page);

    await page.goto(url);

    const clickPromise = page.getByText('Button 1').click();

    const [, span, errorRequest] = await Promise.all([clickPromise, spanPromise, errorPromise]);
    const err = envelopeRequestParser(errorRequest);

    expect(span.name).toBe('parent_span');
    expect(span.status).toBe('ok');

    expect(err?.exception?.values?.[0]?.value).toBe(
      'Non-Error promise rejection captured with value: Async Promise Rejection',
    );
  },
);
