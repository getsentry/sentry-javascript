import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';

test('sends a server action transaction on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart-spa', transactionEvent => {
    return transactionEvent?.transaction === 'POST getPrefecture';
  });

  await page.goto('/users/6');

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'getPrefecture',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.server_action',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.solidstart',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        },
      }),
    ]),
  );
});

test('sends a server action transaction on client navigation', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart-spa', transactionEvent => {
    return transactionEvent?.transaction === 'POST getPrefecture';
  });

  await page.goto('/');
  await page.locator('#navLink').click();
  await page.waitForURL('/users/5');

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'getPrefecture',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.server_action',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.solidstart',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        },
      }),
    ]),
  );
});
