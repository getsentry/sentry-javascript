import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Will capture a connected trace for all server components and generation functions when visiting a page', async ({
  page,
}) => {
  const someConnectedEvent = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Layout Server Component (/(nested-layout)/nested-layout)' ||
      transactionEvent?.transaction === 'Layout Server Component (/(nested-layout))' ||
      transactionEvent?.transaction === 'Page Server Component (/(nested-layout)/nested-layout)' ||
      transactionEvent?.transaction === 'Page.generateMetadata (/(nested-layout)/nested-layout)'
    );
  });

  const layout1Transaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Layout Server Component (/(nested-layout)/nested-layout)' &&
      (await someConnectedEvent).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  const layout2Transaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Layout Server Component (/(nested-layout))' &&
      (await someConnectedEvent).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  const pageTransaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page Server Component (/(nested-layout)/nested-layout)' &&
      (await someConnectedEvent).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  const generateMetadataTransaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/(nested-layout)/nested-layout)' &&
      (await someConnectedEvent).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  await page.goto('/nested-layout');

  expect(await layout1Transaction).toBeDefined();
  expect(await layout2Transaction).toBeDefined();
  expect(await pageTransaction).toBeDefined();
  expect(await generateMetadataTransaction).toBeDefined();
});
