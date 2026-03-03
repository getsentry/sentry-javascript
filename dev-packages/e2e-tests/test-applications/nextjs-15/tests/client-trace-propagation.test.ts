import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { parseSemver } from '@sentry/core';

const packageJson = require('../package.json');
const nextjsVersion = packageJson.dependencies.next;
const { major, minor } = parseSemver(nextjsVersion);

test('Should propagate traces from server to client in pages router', async ({ page }) => {
  test.skip(
    major === 15 && minor !== undefined && minor < 3,
    'Next.js version does not support clientside instrumentation',
  );

  const serverTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /[locale]/pages-router-client-trace-propagation';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === '/[locale]/pages-router-client-trace-propagation';
  });

  await page.goto(`/123/pages-router-client-trace-propagation`);

  const serverTransaction = await serverTransactionPromise;
  const pageloadTransaction = await pageloadTransactionPromise;

  expect(serverTransaction.contexts?.trace?.trace_id).toBeDefined();
  expect(pageloadTransaction.contexts?.trace?.trace_id).toBe(serverTransaction.contexts?.trace?.trace_id);

  await test.step('release was successfully injected on the serverside', () => {
    // Release as defined in next.config.js
    expect(serverTransaction.release).toBe('foobar123');
  });

  await test.step('release was successfully injected on the clientside', () => {
    // Release as defined in next.config.js
    expect(pageloadTransaction.release).toBe('foobar123');
  });
});
