import { expect } from '@playwright/test';
import type { Event, SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should finish a custom transaction when the page goes background', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadTransaction = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(pageloadTransaction).toBeDefined();

  await page.locator('#start-span').click();
  const spanJson: SpanJSON = await page.evaluate('window.getSpanJson()');

  const id_before = spanJson.span_id;
  const description_before = spanJson.description;
  const status_before = spanJson.status;

  expect(description_before).toBe('test-span');
  expect(status_before).toBeUndefined();

  await page.locator('#go-background').click();

  const id_after = spanJson.span_id;
  const description_after = spanJson.description;
  const status_after = spanJson.status;
  const data_after = spanJson.data;

  expect(id_before).toBe(id_after);
  expect(description_after).toBe(description_before);
  expect(status_after).toBe('cancelled');
  expect(data_after).toStrictEqual({ 'sentry.cancellation_reason': 'document.hidden' });
});
