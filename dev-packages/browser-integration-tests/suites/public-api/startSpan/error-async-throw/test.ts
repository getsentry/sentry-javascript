import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest, shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('should capture a thrown error within an async startSpan callback', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }
  const spanPromise = waitForStreamedSpan(page, span => span.name === 'parent_span');
  const errorPromise = waitForErrorRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const clickPromise = page.getByText('Button 1').click();

  // awaiting both events simultaneously to avoid race conditions
  const [, span, errorRequest] = await Promise.all([clickPromise, spanPromise, errorPromise]);
  const err = envelopeRequestParser(errorRequest);

  expect(span.name).toBe('parent_span');
  expect(span.status).toBe('error');
  expect(err?.exception?.values?.[0]?.value).toBe('Async Thrown Error');
});
