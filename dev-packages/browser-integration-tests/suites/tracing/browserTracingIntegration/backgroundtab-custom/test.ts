import { expect } from '@playwright/test';
import type { SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should finish a custom transaction when the page goes background', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.locator('#start-span').click();
  const spanJsonBefore: SpanJSON = await page.evaluate('window.getSpanJson()');

  const id_before = spanJsonBefore.span_id;
  const description_before = spanJsonBefore.description;
  const status_before = spanJsonBefore.status;

  expect(description_before).toBe('test-span');
  expect(status_before).toBeUndefined();

  await page.locator('#go-background').click();
  const spanJsonAfter: SpanJSON = await page.evaluate('window.getSpanJson()');

  const id_after = spanJsonAfter.span_id;
  const description_after = spanJsonAfter.description;
  const status_after = spanJsonAfter.status;
  const data_after = spanJsonAfter.data;

  expect(id_before).toBe(id_after);
  expect(description_after).toBe(description_before);
  expect(status_after).toBe('cancelled');
  expect(data_after?.['sentry.cancellation_reason']).toBe('document.hidden');
});
