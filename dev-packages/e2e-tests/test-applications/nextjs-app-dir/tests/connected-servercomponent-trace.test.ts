import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const serverTransactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-layout';
  });

  await page.goto('/nested-layout');

  const spanDescriptions = (await serverTransactionEventPromise).spans?.map(span => {
    return span.description;
  });

  expect(spanDescriptions).toContainEqual('Layout Server Component (/(nested-layout)/nested-layout)');
  expect(spanDescriptions).toContainEqual('Layout Server Component (/(nested-layout))');
  expect(spanDescriptions).toContainEqual('Page Server Component (/(nested-layout)/nested-layout)');
  expect(spanDescriptions).toContainEqual('Page.generateMetadata (/(nested-layout)/nested-layout)');
});
