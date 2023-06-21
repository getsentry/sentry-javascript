import { expect, test } from '@playwright/test';
import type { Transaction } from '@sentry/types';

import { getMultipleSentryEnvelopeRequests } from '../../utils';

test('Sends an error to Sentry', async ({ page }) => {
  await page.goto('/');

  await page.waitForTimeout(2000);

  const [, errors] = await Promise.all([
    page.click('#exception-button'),
    getMultipleSentryEnvelopeRequests<Event>(page, 1),
  ]);

  expect(errors[0].exception?.values?.[0].value).toBe('I am an error!');
});

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const [pageloadEnvelope] = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/',
  });

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.transaction).toBe('/');
});

test('Sends a parameterized pageload transaction to Sentry', async ({ page }) => {
  const [pageloadEnvelope] = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/#/user/123',
  });

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.transaction).toBe('/user/:id');
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  await page.waitForTimeout(2000);

  const [, transactions] = await Promise.all([
    page.click('#navigation'),
    getMultipleSentryEnvelopeRequests<Transaction>(page, 1),
  ]);

  expect(transactions[0].contexts?.trace?.op).toBe('navigation');
  expect(transactions[0].transaction).toBe('/user/:id');
});
