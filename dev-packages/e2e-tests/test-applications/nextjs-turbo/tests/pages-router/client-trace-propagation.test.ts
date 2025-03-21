import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { parseSemver } from '@sentry/core';

const packageJson = require('../../package.json');
const nextjsVersion = packageJson.dependencies.next;
const { major, minor } = parseSemver(nextjsVersion);

test('Should propagate traces from server to client in pages router', async ({ page }) => {
  // TODO: Remove this skippage when Next.js 15.3.0 is released and bump version in package json to 15.3.0
  test.skip(
    major === 15 && minor !== undefined && minor < 3,
    'Next.js version does not support clientside instrumentation',
  );

  const serverTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /[param]/pages-router-client-trace-propagation';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === '/[param]/pages-router-client-trace-propagation';
  });

  await page.goto(`/123/pages-router-client-trace-propagation`);

  const serverTransaction = await serverTransactionPromise;
  const pageloadTransaction = await pageloadTransactionPromise;

  expect(serverTransaction.contexts?.trace?.trace_id).toBeDefined();
  expect(pageloadTransaction.contexts?.trace?.trace_id).toBe(serverTransaction.contexts?.trace?.trace_id);
});
