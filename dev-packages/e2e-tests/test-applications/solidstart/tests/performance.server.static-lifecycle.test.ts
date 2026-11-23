import { SENTRY_OP, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a server action transaction on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart', transactionEvent => {
    return transactionEvent?.transaction === 'GET /users/6';
  });

  await page.goto('/users/6');

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'getPrefecture',
        data: {
          [SENTRY_OP]: 'function',
          [SENTRY_ORIGIN]: 'auto.function.solidstart',
          'code.function.name': 'getPrefecture',
        },
      }),
    ]),
  );
});

test('sends a server action transaction on client navigation', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart', transactionEvent => {
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
          [SENTRY_OP]: 'function',
          [SENTRY_ORIGIN]: 'auto.function.solidstart',
          'code.function.name': 'getPrefecture',
        },
      }),
    ]),
  );
});

[
  // SolidStart build output that the HTTP integration does not ignore.
  '/_build/assets/entry.js.map',
  '/_build/.vite/manifest.json',
  // Common static file that the HTTP integration ignores.
  '/favicon.ico',
].forEach(path => {
  test(`does not send a server transaction for the file ${path}`, async ({ baseURL }) => {
    const transactionPaths = await getServerTransactionPathsUntilPage(`${baseURL}`, path);

    expect(transactionPaths).not.toContain(path);
  });
});

// Routes that look like build output. They also show that the helper sees sent transactions, so the tests above cannot
// pass by accident.
['/users/jane.doe', '/users/_build/'].forEach(path => {
  test(`sends a server transaction for the route ${path}`, async ({ baseURL }) => {
    const transactionPaths = await getServerTransactionPathsUntilPage(`${baseURL}`, path);

    expect(transactionPaths).toContain(path);
  });
});

/**
 * Requests `path`, then a page. Returns the `url.path` of each server transaction up to the page's transaction,
 * which arrives after any transaction for `path`.
 */
async function getServerTransactionPathsUntilPage(baseURL: string, path: string): Promise<string[]> {
  const pagePath = `/users/after${path.replace(/\W+/g, '-')}`;
  const transactionPaths: string[] = [];
  const pageTransactionPromise = waitForTransaction('solidstart', transactionEvent => {
    transactionPaths.push(`${transactionEvent.contexts?.trace?.data?.[URL_PATH]}`);
    return transactionPaths.includes(pagePath);
  });

  await fetch(`${baseURL}${path}`);
  await fetch(`${baseURL}${pagePath}`);
  await pageTransactionPromise;

  return transactionPaths;
}
