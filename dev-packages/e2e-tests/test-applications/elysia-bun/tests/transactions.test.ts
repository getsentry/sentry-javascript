import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a successful route', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await request.get(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-success',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
    }),
  );
});

test('Sends a transaction with parameterized route name', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-param/:param'
    );
  });

  await request.get(`${baseURL}/test-param/123`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-param/:param');
  expect(transactionEvent.transaction_info?.source).toBe('route');
});

test('Sends a transaction with multiple parameterized segments', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-multi-param/:param1/:param2'
    );
  });

  await request.get(`${baseURL}/test-multi-param/foo/bar`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-multi-param/:param1/:param2');
  expect(transactionEvent.transaction_info?.source).toBe('route');
});

test('Sends a transaction for an errored route', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-exception/:id'
    );
  });

  await request.get(`${baseURL}/test-exception/777`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-exception/:id');
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});

test('Includes manually started spans with parent-child relationship', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await request.get(`${baseURL}/test-transaction`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  const testSpan = spans.find(span => span.description === 'test-span');
  const childSpan = spans.find(span => span.description === 'child-span');

  expect(testSpan).toEqual(
    expect.objectContaining({
      description: 'test-span',
      origin: 'manual',
    }),
  );

  expect(childSpan).toEqual(
    expect.objectContaining({
      description: 'child-span',
      origin: 'manual',
      parent_span_id: testSpan?.span_id,
    }),
  );
});

test('Creates lifecycle spans for Elysia hooks', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await request.get(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  // Elysia should produce lifecycle spans enriched with sentry attributes
  const elysiaSpans = spans.filter(span => span.origin === 'auto.http.elysia');
  expect(elysiaSpans.length).toBeGreaterThan(0);

  // The Handle span should be present as a request handler
  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'Handle',
      op: 'request_handler.elysia',
      origin: 'auto.http.elysia',
    }),
  );
});

test('Names anonymous handler spans as "anonymous" instead of "<unknown>"', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /with-middleware/test'
    );
  });

  // Use a route with middleware so there are child handler spans
  await request.get(`${baseURL}/with-middleware/test`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  // No <unknown> spans should exist — we name them 'anonymous' instead
  const unknownSpans = spans.filter(span => span.description === '<unknown>');
  expect(unknownSpans).toHaveLength(0);

  // Anonymous handler spans should be named 'anonymous'
  const anonymousSpans = spans.filter(
    span => span.description === 'anonymous' && span.origin === 'auto.http.elysia',
  );
  expect(anonymousSpans.length).toBeGreaterThan(0);

  // Named Elysia lifecycle spans should still be present
  expect(spans.filter(span => span.origin === 'auto.http.elysia').length).toBeGreaterThan(0);
});

test('Creates lifecycle spans for route-specific middleware', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /with-middleware/test'
    );
  });

  await request.get(`${baseURL}/with-middleware/test`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  // BeforeHandle span should be present from the route-specific middleware
  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'BeforeHandle',
      op: 'middleware.elysia',
      origin: 'auto.http.elysia',
    }),
  );
});

test('Captures request metadata for POST requests', async ({ baseURL, request }) => {
  const transactionEventPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'POST /test-post'
    );
  });

  const response = await request.post(`${baseURL}/test-post`, {
    data: { foo: 'bar', other: 1 },
    headers: { 'Content-Type': 'application/json' },
  });
  const resBody = await response.json();

  expect(resBody).toEqual({ status: 'ok', body: { foo: 'bar', other: 1 } });

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.request).toEqual(
    expect.objectContaining({
      method: 'POST',
      url: expect.stringContaining('/test-post'),
      headers: expect.objectContaining({
        'content-type': 'application/json',
      }),
    }),
  );
});
