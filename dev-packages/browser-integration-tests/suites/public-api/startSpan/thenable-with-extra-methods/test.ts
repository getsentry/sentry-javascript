import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

/**
 * These tests verify that thenable objects with extra methods (like jQuery's jqXHR)
 * preserve those methods when returned from startSpan().
 *
 * Tests the Proxy fix that allows code like this to work:
 *   const jqXHR = Sentry.startSpan({ name: "test" }, () => $.ajax(...));
 *   jqXHR.abort(); // Now works! ✅
 */

sentryTest('preserves extra methods on jqXHR-like thenable objects', async ({ getLocalTestUrl, page }) => {
  page.on('console', msg => {
    console.log(`Console log from page: ${msg.text()}`);
  });

  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // Wait for the transaction to be sent
  const transactionPromise = waitForTransactionRequest(page);

  await page.goto(url);

  // Wait for test to complete
  await page.waitForTimeout(200);

  // Verify extra methods are preserved
  const methodsPreserved = await page.evaluate(() => (window as any).jqXHRMethodsPreserved);
  expect(methodsPreserved).toBe(true);

  // Verify abort() was actually called
  const abortCalled = await page.evaluate(() => (window as any).jqXHRAbortCalled);
  expect(abortCalled).toBe(true);

  // Verify abort() returned the correct value
  const abortReturnValue = await page.evaluate(() => (window as any).jqXHRAbortReturnValue);
  expect(abortReturnValue).toBe('abort-successful');

  // Verify no errors occurred
  const testError = await page.evaluate(() => (window as any).jqXHRTestError);
  expect(testError).toBeNull();

  // Verify the span was created and sent
  const transaction = envelopeRequestParser(await transactionPromise);
  expect(transaction.transaction).toBe('test-jqxhr');
  expect(transaction.spans).toBeDefined();
});

sentryTest('preserved methods maintain promise functionality', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  // Wait for promise to resolve
  await page.waitForTimeout(200);

  // Verify promise resolved correctly despite having extra methods
  const promiseResolved = await page.evaluate(() => (window as any).jqXHRPromiseResolved);
  expect(promiseResolved).toBe(true);
});
