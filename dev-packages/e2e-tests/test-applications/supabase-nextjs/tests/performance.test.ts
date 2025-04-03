import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// This test should be run in serial mode to ensure that the test user is created before the other tests
test.describe.configure({ mode: 'serial' });

// This should be the first test as it will be needed for the other tests
test('Sends server-side Supabase auth admin `createUser` span', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/create-test-user'
    );
  });

  await fetch(`${baseURL}/api/create-test-user`);
  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toContainEqual({
    data: expect.any(Object),
    description: 'createUser',
    op: 'db.supabase.auth.admin.createUser',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.db.supabase',
  });
});

test('Sends client-side Supabase db-operation spans and breadcrumbs to Sentry', async ({ page, baseURL }) => {
  const pageloadTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  // Fill in login credentials
  // The email and password should be the same as the ones used in the `create-test-user` endpoint
  await page.locator('input[name=email]').fill('test@sentry.test');
  await page.locator('input[name=password]').fill('sentry.test');
  await page.locator('button[type=submit]').click();

  // Wait for login to complete
  await page.waitForSelector('button:has-text("Add")');

  // Add a new todo entry
  await page.locator('input[id=new-task-text]').fill('test');
  await page.locator('button[id=add-task]').click();

  const transactionEvent = await pageloadTransactionPromise;

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

test('Sends server-side Supabase db-operation spans and breadcrumbs to Sentry', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/add-todo-entry'
    );
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

test('Sends server-side Supabase auth admin `listUsers` span', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/list-users'
    );
  });

  await fetch(`${baseURL}/api/list-users`);
  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toContainEqual({
    data: expect.any(Object),
    description: 'listUsers',
    op: 'db.supabase.auth.admin.listUsers',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.db.supabase',
  });
});
