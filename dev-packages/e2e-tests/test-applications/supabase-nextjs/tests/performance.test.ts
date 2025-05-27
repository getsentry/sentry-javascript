import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

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
    data: expect.objectContaining({
      'db.operation': 'auth.admin.createUser',
      'db.system': 'postgresql',
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
    }),
    description: 'auth (admin) createUser',
    op: 'db',
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
      description: 'select(*) filter(order, asc) from(todos)',
      op: 'db',
      data: expect.objectContaining({
        'db.operation': 'select',
        'db.query': ['select(*)', 'filter(order, asc)'],
        'db.system': 'postgresql',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.supabase',
      }),
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
    data: expect.objectContaining({
      'db.operation': 'select',
      'db.query': ['select(*)', 'filter(order, asc)'],
      'db.system': 'postgresql',
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
    }),
    description: 'select(*) filter(order, asc) from(todos)',
    op: 'db',
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
    message: 'select(*) filter(order, asc) from(todos)',
    data: expect.any(Object),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.insert',
    message: 'insert(...) select(*) from(todos)',
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
      data: expect.objectContaining({
        'db.operation': 'insert',
        'db.query': ['select(*)'],
        'db.system': 'postgresql',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.supabase',
      }),
      description: 'insert(...) select(*) from(todos)',
      op: 'db',
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
    data: expect.objectContaining({
      'db.operation': 'select',
      'db.query': ['select(*)'],
      'db.system': 'postgresql',
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
    }),
    description: 'select(*) from(todos)',
    op: 'db',
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
    message: 'select(*) from(todos)',
    data: expect.any(Object),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.insert',
    message: 'insert(...) select(*) from(todos)',
    data: expect.any(Object),
  });
});

test('Sends server-side Supabase auth admin `listUsers` span', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /api/list-users'
    );
  });

  await fetch(`${baseURL}/api/list-users`);
  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toContainEqual({
    data: expect.objectContaining({
      'db.operation': 'auth.admin.listUsers',
      'db.system': 'postgresql',
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
    }),
    description: 'auth (admin) listUsers',
    op: 'db',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.db.supabase',
  });
});

test('Sends queue publish spans with `schema(...).rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/enqueue-schema'
    );
  });

  const result = await fetch(`${baseURL}/api/enqueue-schema`);

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: [1] });

  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '1',
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.publish',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.rpc.send',
    message: 'rpc(send)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': '1',
    },
  });
});

test('Sends queue publish spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/enqueue-rpc'
    );
  });

  const result = await fetch(`${baseURL}/api/enqueue-rpc`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: [2] });

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '2',
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.publish',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.rpc.send',
    message: 'rpc(send)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': '2',
    },
  });
});

test('Sends queue process spans with `schema(...).rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/dequeue-schema'
    );
  });

  const result = await fetch(`${baseURL}/api/dequeue-schema`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(
    expect.objectContaining({ data: [expect.objectContaining({ message: { title: 'Test Todo' }, msg_id: 1 })] }),
  );

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '1',
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.process',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.rpc.pop',
    message: 'rpc(pop)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': '1',
    },
  });
});

test('Sends queue process spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/dequeue-rpc'
    );
  });

  const result = await fetch(`${baseURL}/api/dequeue-rpc`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(
    expect.objectContaining({ data: [expect.objectContaining({ message: { title: 'Test Todo' }, msg_id: 2 })] }),
  );

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '2',
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.process',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.rpc.pop',
    message: 'rpc(pop)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': '2',
    },
  });
});

test('Sends queue process error spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/dequeue-error'
    );
  });

  const errorEventPromise = waitForError('supabase-nextjs', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value?.includes('pgmq.q_non-existing-queue');
  });

  const result = await fetch(`${baseURL}/api/dequeue-error`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(500);
  expect(await result.json()).toEqual(
    expect.objectContaining({
      error: expect.stringContaining('relation "pgmq.q_non-existing-queue" does not exist'),
    }),
  );

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();

  expect(errorEvent.exception?.values?.[0].value).toBe('relation "pgmq.q_non-existing-queue" does not exist');
  expect(errorEvent.contexts?.supabase).toEqual({
    queueName: 'non-existing-queue',
  });

  expect(errorEvent.breadcrumbs).toContainEqual(
    expect.objectContaining({
      type: 'supabase',
      category: 'db.rpc.pop',
      message: 'rpc(pop)',
      data: {
        'messaging.destination.name': 'non-existing-queue',
      },
    }),
  );

  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'non-existing-queue',
      'messaging.system': 'supabase',
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.process',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'unknown_error',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});

test('Sends queue batch publish spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/batch_enqueue'
    );
  });

  const result = await fetch(`${baseURL}/api/batch_enqueue`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: [3, 4] });

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '3,4',
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.publish',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.rpc.send_batch',
    message: 'rpc(send_batch)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': '3,4',
    },
  });
});

test('Sends `read` queue operation spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /api/queue_read'
    );
  });
  const result = await fetch(`${baseURL}/api/queue_read`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(
    expect.objectContaining({ data: [
      expect.objectContaining({ message: { title: 'Test Todo 1' }, msg_id: 3 }),
      expect.objectContaining({ message: { title: 'Test Todo 2' }, msg_id: 4 }),
    ] }),
  );

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': '3,4',
      'sentry.op': 'queue.receive',
      'sentry.origin': 'auto.db.supabase',
    },
    description: 'supabase.db.rpc',
    op: 'queue.receive',
    origin: 'auto.db.supabase',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});
