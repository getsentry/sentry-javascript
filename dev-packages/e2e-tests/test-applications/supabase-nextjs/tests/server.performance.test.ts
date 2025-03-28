import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends server-side Supabase db-operation spans and breadcrumbs to Sentry', async ({ page, baseURL }) => {
  // Create test user
  await fetch(`${baseURL}/api/create-test-user`);

  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /api/add-todo-entry';
  });

  await fetch(`${baseURL}/api/add-todo-entry`);
  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      description: 'from(todos)',
      op: 'db.select',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      origin: 'auto.db.supabase',
    }),
  );

  expect(transactionEvent.spans).toContainEqual({
    data: expect.any(Object),
    description: 'from(todos)',
    op: 'db.insert',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.db.supabase',
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.select',
    message: 'from(todos)',
    data: expect.any(Object),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.insert',
    message: 'from(todos)',
    data: expect.any(Object),
  });
});
