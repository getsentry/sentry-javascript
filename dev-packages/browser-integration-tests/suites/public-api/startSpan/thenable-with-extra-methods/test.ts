import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('preserves extra methods on real jQuery jqXHR objects', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const transactionPromise = waitForTransactionRequest(page);

  await page.goto(url);

  // Wait for jQuery to load
  await page.waitForTimeout(1000);

  const methodsPreserved = await page.evaluate(() => (window as any).jqXHRMethodsPreserved);
  expect(methodsPreserved).toBe(true);

  const abortCalled = await page.evaluate(() => (window as any).jqXHRAbortCalled);
  expect(abortCalled).toBe(true);

  const abortReturnValue = await page.evaluate(() => (window as any).jqXHRAbortResult);
  expect(abortReturnValue).toBe('abort-successful');

  const testError = await page.evaluate(() => (window as any).jqXHRTestError);
  expect(testError).toBeNull();

  const transaction = envelopeRequestParser(await transactionPromise);
  expect(transaction.transaction).toBe('test-jqxhr');
  expect(transaction.spans).toBeDefined();
});

sentryTest('aborted request rejects promise correctly', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  // Wait for jQuery to load
  await page.waitForTimeout(1000);

  const promiseRejected = await page.evaluate(() => (window as any).jqXHRPromiseRejected);
  expect(promiseRejected).toBe(true);

  const promiseResolved = await page.evaluate(() => (window as any).jqXHRPromiseResolved);
  expect(promiseResolved).toBe(false);
});
