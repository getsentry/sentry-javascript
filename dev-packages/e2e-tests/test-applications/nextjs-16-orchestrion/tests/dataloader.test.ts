import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments dataloader automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/dataloader'
    );
  });

  await fetch(`${baseURL}/api/dataloader`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  const loadSpan = spans.find(span => span.description === 'dataloader.load usersLoader');
  expect(loadSpan).toBeDefined();
  expect(loadSpan?.op).toBe('cache.get');
  expect(loadSpan?.origin).toBe('auto.db.orchestrion.dataloader');
  expect(loadSpan?.status).toBe('ok');
  expect(loadSpan?.data?.['cache.key']).toEqual(['user-1']);

  // The batch span opens on the deferred dispatch tick and links back to the load span.
  const batchSpan = spans.find(span => span.description === 'dataloader.batch usersLoader');
  expect(batchSpan).toBeDefined();
  expect(batchSpan?.op).toBe('cache.get');
  expect(batchSpan?.origin).toBe('auto.db.orchestrion.dataloader');
  expect(batchSpan?.status).toBe('ok');
});
