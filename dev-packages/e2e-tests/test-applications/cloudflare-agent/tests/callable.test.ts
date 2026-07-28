import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('@callable() methods work correctly with Sentry instrumentDurableObjectWithSentry', async ({ page, baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /agents/my-agent/user-123' &&
      transactionEvent.contexts?.trace?.parent_span_id !== undefined
    );
  });

  // The greet() call goes over the websocket, so its storage spans land in a webSocketMessage
  // transaction. Filter for the one carrying our put span — control messages produce their own
  // webSocketMessage transactions without storage spans.
  const storageTransactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'webSocketMessage' &&
      (transactionEvent.spans ?? []).some(span => span.description === 'durable_object_storage_put')
    );
  });

  await page.goto(baseURL!);

  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Call Agent' }).click();
  await expect(page.getByText('Hello, World!')).toBeVisible();

  const transaction = await transactionPromise;

  expect(transaction).toEqual({
    contexts: {
      trace: {
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        data: expect.any(Object),
        op: 'http.server',
        status: 'ok',
        origin: 'auto.http.cloudflare',
      },
      cloud_resource: { 'cloud.provider': 'cloudflare' },
      culture: { timezone: expect.any(String) },
      runtime: { name: 'cloudflare' },
    },
    spans: [],
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /agents/my-agent/user-123',
    type: 'transaction',
    request: {
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringContaining('/agents/my-agent/user-123'),
      query_string: expect.any(String),
    },
    transaction_info: { source: 'url' },
    platform: 'javascript',
    event_id: expect.stringMatching(/[a-f0-9]{32}/),
    environment: expect.any(String),
    release: expect.any(String),
    sdk: {
      integrations: expect.any(Array),
      name: 'sentry.javascript.cloudflare',
      version: expect.any(String),
      packages: expect.any(Array),
    },
  });

  // greet() touches 6 storage keys: 2 user ops + 3 framework-internal keys (cf_, __ps_, /) that
  // must be filtered + 1 allowlisted cf_ key. Spans carry no key attribute, so filtering can only
  // be verified by count — exactly these 3 storage spans (in execution order) should survive, and
  // any framework-internal span leaking through shows up as an extra entry here.
  const storageTransaction = await storageTransactionPromise;

  const storageSpans = (storageTransaction.spans ?? []).filter(
    span => span.origin === 'auto.db.cloudflare.durable_object',
  );

  expect(storageSpans).toEqual([
    expect.objectContaining({
      data: {
        'db.operation.name': 'put',
        'db.system.name': 'cloudflare.durable_object.storage',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.cloudflare.durable_object',
      },
      description: 'durable_object_storage_put',
      op: 'db',
      origin: 'auto.db.cloudflare.durable_object',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
    expect.objectContaining({
      data: {
        'db.operation.name': 'get',
        'db.system.name': 'cloudflare.durable_object.storage',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.cloudflare.durable_object',
      },
      description: 'durable_object_storage_get',
      op: 'db',
      origin: 'auto.db.cloudflare.durable_object',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
    expect.objectContaining({
      data: {
        'db.operation.name': 'get',
        'db.system.name': 'cloudflare.durable_object.storage',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.cloudflare.durable_object',
      },
      description: 'durable_object_storage_get',
      op: 'db',
      origin: 'auto.db.cloudflare.durable_object',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
  ]);
});
