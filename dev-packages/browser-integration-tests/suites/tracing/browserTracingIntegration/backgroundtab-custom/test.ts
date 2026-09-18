import { expect } from '@playwright/test';
import type { StreamedSpanJSON } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should finish a custom transaction when the page goes background', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.locator('#start-span').click();
  const spanJsonBefore: StreamedSpanJSON = await page.evaluate('window.getSpanJson()');

  const id_before = spanJsonBefore.span_id;
  const name_before = spanJsonBefore.name;
  const status_before = spanJsonBefore.status;

  expect(name_before).toBe('test-span');
  expect(status_before).toBe('ok');

  await page.locator('#go-background').click();
  const spanJsonAfter: StreamedSpanJSON = await page.evaluate('window.getSpanJson()');

  const id_after = spanJsonAfter.span_id;
  const name_after = spanJsonAfter.name;
  const attributes_after = spanJsonAfter.attributes;

  expect(id_before).toBe(id_after);
  expect(name_after).toBe(name_before);
  // a cancelled span is reported as `ok`, with the raw status kept as an attribute
  expect(spanJsonAfter.status).toBe('ok');
  expect(attributes_after['sentry.status.message']).toBeUndefined();
  expect(attributes_after['sentry.cancellation_reason']).toBe('document.hidden');
});
