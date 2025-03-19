import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { parseSemver } from '@sentry/core';

const packageJson = require('../../package.json');
const nextjsVersion = packageJson.dependencies.next;
const { major, minor } = parseSemver(nextjsVersion);

test('Should record pageload transactions (this test verifies that the client SDK is initialized)', async ({
  page,
}) => {
  // TODO: Remove this skippage when Next.js 15.3.0 is released and bump version in package json to 15.3.0
  test.skip(
    major === 15 && minor !== undefined && minor < 3,
    'Next.js version does not support clientside instrumentation',
  );

  const pageloadTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === '/pageload-transaction';
  });

  await page.goto(`/pageload-transaction`);

  const pageloadTransaction = await pageloadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
});
