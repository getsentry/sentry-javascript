import { expect, test } from '@playwright/test';
import { waitForError, waitForRootSpan, waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const isSpanStreaming = process.env.NEXT_PUBLIC_E2E_NEXTJS_SPAN_STREAMING === '1';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'middleware GET';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareRootSpan = await middlewareRootSpanPromise;

  expect(middlewareRootSpan.status).toBe('ok');
  expect(middlewareRootSpan.op).toBe('http.server.middleware');

  if (!isSpanStreaming) {
    const raw = middlewareRootSpan.raw as Record<string, unknown>;
    expect((raw as { contexts?: { runtime?: { name?: string } } }).contexts?.runtime?.name).toBe('node');
    expect((raw as { transaction_info?: { source?: string } }).transaction_info?.source).toBe('route');
    expect((raw as { tags?: Record<string, unknown> }).tags?.['my-isolated-tag']).toBe(true);
    expect((raw as { tags?: Record<string, unknown> }).tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  }
});

test('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
  const middlewareRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'middleware GET';
  });

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record transactions', async () => {
    const middlewareRootSpan = await middlewareRootSpanPromise;
    expect(middlewareRootSpan.status).toMatch(/^(internal_error|error)$/);
    expect(middlewareRootSpan.op).toBe('http.server.middleware');

    if (!isSpanStreaming) {
      const raw = middlewareRootSpan.raw as Record<string, unknown>;
      expect((raw as { contexts?: { runtime?: { name?: string } } }).contexts?.runtime?.name).toBe('node');
      expect((raw as { transaction_info?: { source?: string } }).transaction_info?.source).toBe('route');
    }
  });
});

test('Should trace outgoing fetch requests inside middleware and create breadcrumbs for it', async ({ request }) => {
  test.skip(isSpanStreaming, 'Breadcrumb assertions require transaction envelope format');
  test.skip(isDevMode, 'The fetch requests ends up in a separate tx in dev atm');
  const middlewareTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  // In some builds (especially webpack), fetch spans may end up in a separate transaction instead of as child spans
  // This test validates that the fetch is traced either way
  const fetchTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET http://localhost:3030/' ||
      transactionEvent?.contexts?.trace?.description === 'GET http://localhost:3030/'
    );
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const middlewareTransaction = await middlewareTransactionPromise;

  // Breadcrumbs should always be created for the fetch request
  expect(middlewareTransaction.breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'http',
        data: { 'http.method': 'GET', status_code: 200, url: 'http://localhost:3030/' },
        timestamp: expect.any(Number),
        type: 'http',
      },
    ]),
  );

  // Check if http.client span exists as a child of the middleware transaction
  const hasHttpClientSpan = !!middlewareTransaction.spans?.find(span => span.op === 'http.client');

  if (hasHttpClientSpan) {
    // Check if fetch is traced as a child span of the middleware transaction
    expect(middlewareTransaction.spans).toEqual(
      expect.arrayContaining([
        {
          data: {
            'http.request.method': 'GET',
            'http.request.method_original': 'GET',
            'http.response.status_code': 200,
            'network.peer.address': '::1',
            'network.peer.port': 3030,
            'otel.kind': 'CLIENT',
            'sentry.op': 'http.client',
            'sentry.origin': 'auto.http.otel.node_fetch',
            'server.address': 'localhost',
            'server.port': 3030,
            url: 'http://localhost:3030/',
            'url.full': 'http://localhost:3030/',
            'url.path': '/',
            'url.query': '',
            'url.scheme': 'http',
            'user_agent.original': 'node',
          },
          description: 'GET http://localhost:3030/',
          op: 'http.client',
          origin: 'auto.http.otel.node_fetch',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      ]),
    );
  } else {
    // Alternatively, fetch is traced as a separate transaction, similar to Dev builds
    const fetchTransaction = await fetchTransactionPromise;

    expect(fetchTransaction.contexts?.trace?.op).toBe('http.client');
    expect(fetchTransaction.contexts?.trace?.status).toBe('ok');
    expect(fetchTransaction.contexts?.trace?.data?.['http.request.method']).toBe('GET');
    expect(fetchTransaction.contexts?.trace?.data?.['url.full']).toBe('http://localhost:3030/');
  }
});
