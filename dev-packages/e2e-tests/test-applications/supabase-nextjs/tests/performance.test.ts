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

test('Sends server-side Supabase RPC spans and breadcrumbs', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return !!(
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /api/rpc/status'
    );
  });

  const result = await fetch(`${baseURL}/api/rpc/status`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);

  const responseBody = await result.json();
  expect(responseBody.error).toBeNull();
  expect(responseBody.data).toEqual({ status: 'ok' });

  const rpcSpan = transactionEvent.spans?.find(
    span =>
      span?.op === 'db' &&
      typeof span?.description === 'string' &&
      span.description.includes('get_supabase_status') &&
      span?.data?.['sentry.origin'] === 'auto.db.supabase',
  );

  expect(rpcSpan).toBeDefined();
  expect(rpcSpan?.data).toEqual(
    expect.objectContaining({
      'db.operation': 'insert',
      'db.table': 'get_supabase_status',
      'db.system': 'postgresql',
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
    }),
  );
  expect(rpcSpan?.description).toContain('get_supabase_status');

  expect(transactionEvent.breadcrumbs).toBeDefined();
  expect(
    transactionEvent.breadcrumbs?.some(
      breadcrumb =>
        breadcrumb?.type === 'supabase' &&
        breadcrumb?.category === 'db.insert' &&
        typeof breadcrumb?.message === 'string' &&
        breadcrumb.message.includes('get_supabase_status'),
    ),
  ).toBe(true);
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

  // Wait for login to complete and the todo list to load (this triggers the SELECT operation)
  await page.waitForSelector('button:has-text("Add")');

  const transactionEvent = await pageloadTransactionPromise;

  // The SELECT operation happens on component mount when TodoList fetches todos
  // This is reliably captured in the pageload transaction
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

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.select',
    message: 'select(*) filter(order, asc) from(todos)',
    data: expect.any(Object),
  });

  // Note: INSERT operations are tested in the server-side test where timing is more controlled.
  // Client-side INSERT happens asynchronously after user interaction and may occur after
  // the pageload transaction has already been finalized by idle detection.
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
      // Note: INSERT may fail with 400 if auth fails (no valid user_id for RLS)
      status: expect.stringMatching(/ok|invalid_argument/),
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
      transactionEvent?.transaction === 'GET /api/queue/producer-schema'
    );
  });

  const result = await fetch(`${baseURL}/api/queue/producer-schema`);

  expect(result.status).toBe(200);
  const responseData = await result.json();
  expect(responseData.data).toHaveLength(1);
  expect(typeof responseData.data[0]).toBe('number');
  const messageId = responseData.data[0];

  const transactionEvent = await httpTransactionPromise;

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': String(messageId),
      'messaging.operation.type': 'publish',
      'messaging.operation.name': 'send',
      'messaging.message.body.size': expect.any(Number),
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase.queue.producer',
      'sentry.source': 'task',
    },
    description: 'publish todos',
    op: 'queue.publish',
    origin: 'auto.db.supabase.queue.producer',
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
    category: 'queue.publish',
    message: 'queue.publish(todos)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': String(messageId),
      'messaging.message.body.size': expect.any(Number),
    },
  });
});

test('Sends queue publish spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/producer-rpc'
    );
  });

  const result = await fetch(`${baseURL}/api/queue/producer-rpc`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const responseData = await result.json();
  expect(responseData.data).toHaveLength(1);
  expect(typeof responseData.data[0]).toBe('number');
  const messageId = responseData.data[0];

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': String(messageId),
      'messaging.operation.type': 'publish',
      'messaging.operation.name': 'send',
      'messaging.message.body.size': expect.any(Number),
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase.queue.producer',
      'sentry.source': 'task',
    },
    description: 'publish todos',
    op: 'queue.publish',
    origin: 'auto.db.supabase.queue.producer',
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
    category: 'queue.publish',
    message: 'queue.publish(todos)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': String(messageId),
      'messaging.message.body.size': expect.any(Number),
    },
  });
});

test('Sends queue process spans with `schema(...).rpc(...)`', async ({ page, baseURL }) => {
  // Purge any stale messages from previous tests to ensure we get the message we just produced
  await fetch(`${baseURL}/api/queue/purge`);

  const producerTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return !!(
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/producer-schema' &&
      transactionEvent?.spans?.some((span: any) => span.op === 'queue.publish')
    );
  });

  await fetch(`${baseURL}/api/queue/producer-schema`);
  const producerTransaction = await producerTransactionPromise;

  const producerSpan = producerTransaction.spans?.find(span => span.op === 'queue.publish');
  expect(producerSpan).toBeDefined();

  // Wait a bit for the message to be in the queue
  await new Promise(resolve => setTimeout(resolve, 100));

  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return Boolean(
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/consumer-schema' &&
      transactionEvent?.spans?.some((span: any) => span.op === 'queue.process'),
    );
  });

  const result = await fetch(`${baseURL}/api/queue/consumer-schema`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const responseData = await result.json();
  expect(responseData).toEqual(
    expect.objectContaining({
      data: [
        expect.objectContaining({
          message: {
            title: 'Test Todo',
          },
          msg_id: expect.any(Number),
        }),
      ],
    }),
  );

  // Verify _sentry metadata is cleaned from response
  const queueMessage = responseData.data?.[0];
  expect(queueMessage).toBeDefined();
  expect(queueMessage.message).toBeDefined();
  expect(queueMessage.message._sentry).toBeUndefined();

  const consumerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.process' && span.description === 'process todos',
  );
  expect(consumerSpan).toBeDefined();

  expect(consumerSpan).toMatchObject({
    data: expect.objectContaining({
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': expect.any(String),
      'messaging.operation.type': 'process',
      'messaging.operation.name': 'pop',
      'messaging.message.body.size': expect.any(Number),
      'messaging.message.receive.latency': expect.any(Number),
      'messaging.message.retry.count': expect.any(Number),
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase.queue.consumer',
    }),
    description: 'process todos',
    op: 'queue.process',
    origin: 'auto.db.supabase.queue.consumer',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // Verify span link for distributed tracing across separate HTTP requests
  expect(consumerSpan?.links).toBeDefined();
  expect(consumerSpan?.links?.length).toBeGreaterThanOrEqual(1);

  const producerLink = consumerSpan?.links?.[0];
  expect(producerLink).toMatchObject({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    attributes: {
      'sentry.link.type': 'queue.producer',
    },
  });

  // This ensures distributed tracing works correctly across separate HTTP transactions
  expect(producerLink?.trace_id).toBe(producerSpan?.trace_id);
  expect(producerLink?.span_id).toBe(producerSpan?.span_id);

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'queue.process',
    message: 'queue.process(todos)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': expect.any(String),
      'messaging.message.body.size': expect.any(Number),
    },
  });
});

test('Sends queue process spans with `rpc(...)`', async ({ page, baseURL }) => {
  // Purge any stale messages from previous tests to ensure we get the message we just produced
  await fetch(`${baseURL}/api/queue/purge`);

  const producerTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return !!(
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/producer-rpc' &&
      transactionEvent?.spans?.some((span: any) => span.op === 'queue.publish')
    );
  });

  await fetch(`${baseURL}/api/queue/producer-rpc`);
  const producerTransaction = await producerTransactionPromise;

  const producerSpan = producerTransaction.spans?.find(span => span.op === 'queue.publish');
  expect(producerSpan).toBeDefined();

  // Wait a bit for the message to be in the queue
  await new Promise(resolve => setTimeout(resolve, 100));

  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return !!(
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/consumer-rpc' &&
      transactionEvent?.spans?.some((span: any) => span.op === 'queue.process')
    );
  });

  const result = await fetch(`${baseURL}/api/queue/consumer-rpc`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const responseData = await result.json();
  expect(responseData).toEqual(
    expect.objectContaining({
      data: [
        expect.objectContaining({
          message: {
            title: 'Test Todo',
          },
          msg_id: expect.any(Number),
        }),
      ],
    }),
  );

  // Verify _sentry metadata is cleaned from response
  const queueMessage = responseData.data?.[0];
  expect(queueMessage).toBeDefined();
  expect(queueMessage.message).toBeDefined();
  expect(queueMessage.message._sentry).toBeUndefined();

  const consumerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.process' && span.description === 'process todos',
  );
  expect(consumerSpan).toBeDefined();

  expect(consumerSpan).toMatchObject({
    data: expect.objectContaining({
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': expect.any(String),
      'messaging.operation.type': 'process',
      'messaging.operation.name': 'pop',
      'messaging.message.body.size': expect.any(Number),
      'messaging.message.receive.latency': expect.any(Number),
      'messaging.message.retry.count': expect.any(Number),
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase.queue.consumer',
    }),
    description: 'process todos',
    op: 'queue.process',
    origin: 'auto.db.supabase.queue.consumer',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // Verify span link for distributed tracing across separate HTTP requests
  expect(consumerSpan?.links).toBeDefined();
  expect(consumerSpan?.links?.length).toBeGreaterThanOrEqual(1);

  const producerLink = consumerSpan?.links?.[0];
  expect(producerLink).toMatchObject({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    attributes: {
      'sentry.link.type': 'queue.producer',
    },
  });

  // This ensures distributed tracing works correctly across separate HTTP transactions
  expect(producerLink?.trace_id).toBe(producerSpan?.trace_id);
  expect(producerLink?.span_id).toBe(producerSpan?.span_id);

  expect(transactionEvent.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'queue.process',
    message: 'queue.process(todos)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': expect.any(String),
      'messaging.message.body.size': expect.any(Number),
    },
  });
});

test('Sends queue process error spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return !!(
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/consumer-error'
    );
  });

  const errorEventPromise = waitForError('supabase-nextjs', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('pgmq.q_non-existing-queue');
  });

  const result = await fetch(`${baseURL}/api/queue/consumer-error`);
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
      category: 'queue.process',
      message: 'queue.process(non-existing-queue)',
      data: {
        'messaging.destination.name': 'non-existing-queue',
      },
    }),
  );

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'messaging.destination.name': 'non-existing-queue',
        'messaging.system': 'supabase',
        'messaging.operation.type': 'process',
        'messaging.operation.name': 'pop',
        'messaging.message.retry.count': expect.any(Number),
        'sentry.op': 'queue.process',
        'sentry.origin': 'auto.db.supabase.queue.consumer',
      }),
      description: 'process non-existing-queue',
      op: 'queue.process',
      origin: 'auto.db.supabase.queue.consumer',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'internal_error',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
  );
});

test('Sends queue batch publish spans with `rpc(...)`', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/producer-batch'
    );
  });

  const result = await fetch(`${baseURL}/api/queue/producer-batch`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const responseData = await result.json();
  expect(responseData).toEqual({
    data: expect.arrayContaining([expect.any(Number), expect.any(Number)]),
  });
  expect(responseData.data).toHaveLength(2);

  expect(transactionEvent.spans).toHaveLength(2);
  expect(transactionEvent.spans).toContainEqual({
    data: {
      'messaging.destination.name': 'todos',
      'messaging.system': 'supabase',
      'messaging.message.id': expect.stringMatching(/^\d+,\d+$/),
      'messaging.operation.type': 'publish',
      'messaging.operation.name': 'send_batch',
      'messaging.batch.message_count': 2,
      'messaging.message.body.size': expect.any(Number),
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase.queue.producer',
      'sentry.source': 'task',
    },
    description: 'publish todos',
    op: 'queue.publish',
    origin: 'auto.db.supabase.queue.producer',
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
    category: 'queue.publish',
    message: 'queue.publish(todos)',
    data: {
      'messaging.destination.name': 'todos',
      'messaging.message.id': expect.stringMatching(/^\d+,\d+$/),
      'messaging.batch.message_count': 2,
      'messaging.message.body.size': expect.any(Number),
    },
  });
});

test('End-to-end producer-consumer flow with trace propagation', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/producer-consumer-flow'
    );
  });

  const result = await fetch(`${baseURL}/api/queue/producer-consumer-flow`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.success).toBe(true);
  expect(body.produced.messageId).toBeDefined();
  expect(body.consumed.messageId).toBeDefined();

  // Should have producer span, consumer span, and archive RPC span
  expect(transactionEvent.spans?.length).toBeGreaterThanOrEqual(3);

  const producerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.publish' && span.data?.['messaging.destination.name'] === 'e2e-flow-queue',
  );
  expect(producerSpan).toBeDefined();
  expect(producerSpan?.origin).toBe('auto.db.supabase.queue.producer');
  expect(producerSpan?.data?.['messaging.system']).toBe('supabase');
  expect(producerSpan?.data?.['messaging.message.id']).toBeDefined();

  const consumerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.process' && span.data?.['messaging.destination.name'] === 'e2e-flow-queue',
  );
  expect(consumerSpan).toBeDefined();
  expect(consumerSpan?.origin).toBe('auto.db.supabase.queue.consumer');
  expect(consumerSpan?.data?.['messaging.system']).toBe('supabase');
  expect(consumerSpan?.data?.['messaging.message.id']).toBeDefined();
  expect(consumerSpan?.data?.['messaging.message.receive.latency']).toBeDefined();

  // Verify all spans share the same trace_id within the HTTP transaction
  expect(producerSpan?.trace_id).toBe(consumerSpan?.trace_id);
  expect(producerSpan?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);

  // Producer and consumer are siblings under the HTTP transaction
  // Both are direct children of the HTTP request span, not parent-child of each other
  const httpTransactionSpanId = transactionEvent.contexts?.trace?.span_id;
  expect(producerSpan?.parent_span_id).toBe(httpTransactionSpanId);
  expect(consumerSpan?.parent_span_id).toBe(httpTransactionSpanId);

  // Verify consumer span has a span link to producer span
  // This creates a logical association between producer and consumer operations
  // without making them parent-child (they're siblings in the same trace)
  expect(consumerSpan?.links).toBeDefined();
  expect(consumerSpan?.links?.length).toBe(1);

  // Verify the span link points to the producer span
  const producerLink = consumerSpan?.links?.[0];
  expect(producerLink).toMatchObject({
    trace_id: producerSpan?.trace_id,
    span_id: producerSpan?.span_id,
    attributes: {
      'sentry.link.type': 'queue.producer',
    },
  });

  // Producer spans don't have links (only consumers link to producers)
  expect(producerSpan?.links).toBeUndefined();
});

test('Batch producer-consumer flow with multiple messages', async ({ page, baseURL }) => {
  const httpTransactionPromise = waitForTransaction('supabase-nextjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/queue/batch-flow'
    );
  });

  const result = await fetch(`${baseURL}/api/queue/batch-flow`);
  const transactionEvent = await httpTransactionPromise;

  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.success).toBe(true);
  expect(body.batchSize).toBe(3);
  expect(body.consumed.count).toBe(3);

  expect(transactionEvent.spans).toBeDefined();
  const producerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.publish' && span.data?.['messaging.destination.name'] === 'batch-flow-queue',
  );
  expect(producerSpan).toBeDefined();
  expect(producerSpan?.origin).toBe('auto.db.supabase.queue.producer');
  expect(producerSpan?.data?.['messaging.batch.message_count']).toBe(3);
  expect(producerSpan?.data?.['messaging.message.id']).toMatch(/,/); // Should have multiple IDs

  const consumerSpan = transactionEvent.spans?.find(
    span => span.op === 'queue.process' && span.data?.['messaging.destination.name'] === 'batch-flow-queue',
  );
  expect(consumerSpan).toBeDefined();
  expect(consumerSpan?.origin).toBe('auto.db.supabase.queue.consumer');
  expect(consumerSpan?.data?.['messaging.message.id']).toMatch(/,/); // Multiple IDs consumed
});
