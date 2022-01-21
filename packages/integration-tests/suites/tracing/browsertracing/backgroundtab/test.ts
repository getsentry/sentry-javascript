import { expect, JSHandle } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

async function getPropertyValue(handle: JSHandle, prop: string) {
  return (await handle.getProperty(prop))?.jsonValue();
}

sentryTest('should finish transaction when the goes background', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadTransaction = await getSentryTransactionRequest(page, url);
  expect(pageloadTransaction).toBeDefined();

  await page.click('#start-transaction');
  const transactionHandle = await page.evaluateHandle('window.transaction');

  const id_before = await getPropertyValue(transactionHandle, 'span_id');
  const name_before = await getPropertyValue(transactionHandle, 'name');
  const status_before = await getPropertyValue(transactionHandle, 'status');
  const tags_before = await getPropertyValue(transactionHandle, 'tags');

  expect(name_before).toBe('test-transaction');
  expect(status_before).toBeUndefined();
  expect(tags_before).toStrictEqual({});

  await page.click('#go-background');

  const id_after = await getPropertyValue(transactionHandle, 'span_id');
  const name_after = await getPropertyValue(transactionHandle, 'name');
  const status_after = await getPropertyValue(transactionHandle, 'status');
  const tags_after = await getPropertyValue(transactionHandle, 'tags');

  expect(id_before).toBe(id_after);
  expect(name_after).toBe(name_before);
  expect(status_after).toBe('cancelled');
  expect(tags_after).toStrictEqual({ finishReason: 'documentHidden', visibilitychange: 'document.hidden' });
});
