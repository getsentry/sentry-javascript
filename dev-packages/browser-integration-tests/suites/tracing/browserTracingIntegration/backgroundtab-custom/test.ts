import type { JSHandle } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

async function getPropertyValue(handle: JSHandle, prop: string) {
  return (await handle.getProperty(prop))?.jsonValue();
}

sentryTest('should finish a custom transaction when the page goes background', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadTransaction = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(pageloadTransaction).toBeDefined();

  await page.locator('#start-transaction').click();
  const transactionHandle = await page.evaluateHandle('window.transaction');

  const id_before = await getPropertyValue(transactionHandle, 'span_id');
  const nameBefore = JSON.parse(await transactionHandle.evaluate((t: any) => JSON.stringify(t))).description;
  const status_before = await getPropertyValue(transactionHandle, 'status');
  const tags_before = await getPropertyValue(transactionHandle, 'tags');

  expect(nameBefore).toBe('test-transaction');
  expect(status_before).toBeUndefined();
  expect(tags_before).toStrictEqual({});

  await page.locator('#go-background').click();

  const id_after = await getPropertyValue(transactionHandle, 'span_id');
  const nameAfter = JSON.parse(await transactionHandle.evaluate((t: any) => JSON.stringify(t))).description;
  const status_after = await getPropertyValue(transactionHandle, 'status');
  const tags_after = await getPropertyValue(transactionHandle, 'tags');

  expect(id_before).toBe(id_after);
  expect(nameAfter).toBe('test-transaction');
  expect(status_after).toBe('cancelled');
  expect(tags_after).toStrictEqual({ visibilitychange: 'document.hidden' });
});
