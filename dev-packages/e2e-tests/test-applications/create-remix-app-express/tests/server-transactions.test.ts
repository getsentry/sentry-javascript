import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends parameterized transaction name to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/user/123');

  const transaction = await transactionPromise;

  expect(transaction).toBeDefined();
  expect(transaction.transaction).toBe('GET user/:id');
});

test('Sends form data with action span', async ({ page }) => {
  const formdataActionTransaction = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'action') || false;
  });

  await page.goto('/action-formdata');

  await page.fill('input[name=text]', 'test');
  await page.setInputFiles('input[type=file]', {
    name: 'file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is test'),
  });

  await page.locator('button[type=submit]').click();

  const actionSpan = (await formdataActionTransaction)?.spans?.find(
    span => span.data && span.data['code.function'] === 'action',
  );

  expect(actionSpan).toBeDefined();
  expect(actionSpan?.op).toBe('action.remix');
  expect(actionSpan?.data).toMatchObject({
    'formData.text': 'test',
    'formData.file': 'file.txt',
  });
});

test('Sends a loader span to Sentry', async ({ page }) => {
  const loaderTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'loader') || false;
  });

  await page.goto('/');

  const loaderSpan = (await loaderTransactionPromise)?.spans?.find(
    span => span.data && span.data['code.function'] === 'loader',
  );

  expect(loaderSpan).toBeDefined();
  expect(loaderSpan?.op).toBe('loader.remix');
});

test('Propagates trace when ErrorBoundary is triggered', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/client-error?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;
  const loaderSpanId = httpServerTransaction?.spans?.find(
    span => span.data && span.data['code.function'] === 'loader',
  )?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET client-error');
  expect(pageloadTransaction.transaction).toBe('/client-error');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});

test('Parameterizes a 2-level nested route on the server', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.contexts?.trace?.op === 'http.server' && txn.transaction === 'GET users/:userId/posts/:postId';
  });

  await page.goto('/users/user123/posts/post456');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(transaction.spans?.some(s => s.data?.['code.function'] === 'loader' && s.op === 'loader.remix')).toBe(true);
});

test('Parameterizes a 3-level nested API route on the server', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.contexts?.trace?.op === 'http.server' && txn.transaction === 'GET api/v1/data/:id';
  });

  await page.goto('/api/v1/data/abc123');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Parameterizes a deeply nested route on the server', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.contexts?.trace?.op === 'http.server' && txn.transaction === 'GET deeply/:nested/:structure/:id';
  });

  await page.goto('/deeply/level1/level2/level3');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Parameterizes a flat dot-notation route on the server', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.contexts?.trace?.op === 'http.server' && txn.transaction === 'GET products/:productId/reviews/:reviewId';
  });

  await page.goto('/products/prod789/reviews/rev101');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Records action and loader spans on a parameterized action route', async ({ request }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.transaction === 'POST action-json-response/:id';
  });

  await request.post('/action-json-response/123123');

  const transaction = await transactionPromise;

  const actionSpan = transaction.spans?.find(
    s => s.data?.['code.function'] === 'action' && s.data?.['match.route.id'] === 'routes/action-json-response.$id',
  );
  expect(actionSpan).toBeDefined();
  expect(actionSpan?.op).toBe('action.remix');
  expect(actionSpan?.data?.['match.params.id']).toBe('123123');

  const rootLoaderSpan = transaction.spans?.find(
    s => s.data?.['code.function'] === 'loader' && s.data?.['match.route.id'] === 'root',
  );
  expect(rootLoaderSpan).toBeDefined();

  const routeLoaderSpan = transaction.spans?.find(
    s => s.data?.['code.function'] === 'loader' && s.data?.['match.route.id'] === 'routes/action-json-response.$id',
  );
  expect(routeLoaderSpan).toBeDefined();

  expect(transaction.request?.method).toBe('POST');
});

test('Records loader spans on a deferred loader response', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.transaction === 'GET loader-defer-response/:id';
  });

  await page.goto('/loader-defer-response/123123');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(
    transaction.spans?.some(
      s => s.data?.['code.function'] === 'loader' && s.data?.['match.route.id'] === 'routes/loader-defer-response.$id',
    ),
  ).toBe(true);
});

test('Continues a trace from incoming sentry-trace and baggage headers', async ({ request }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.contexts?.trace?.trace_id === '12312012123120121231201212312012';
  });

  await request.get('/loader-json-response/3', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-version=1.0,sentry-environment=production,sentry-trace_id=12312012123120121231201212312012',
    },
  });

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.parent_span_id).toBe('1121201211212012');
});

test('Does not bleed scope tags between concurrent requests', async ({ request }) => {
  const txnPromises = [1, 2, 3, 4].map(i =>
    waitForTransaction('create-remix-app-express', txn => {
      return txn.transaction === 'GET scope-bleed/:id' && txn.tags?.[`tag${i}`] === String(i);
    }),
  );

  await Promise.all([
    request.get('/scope-bleed/1'),
    request.get('/scope-bleed/2'),
    request.get('/scope-bleed/3'),
    request.get('/scope-bleed/4'),
  ]);

  const transactions = await Promise.all(txnPromises);

  transactions.forEach(txn => {
    const tags = txn.tags ?? {};
    const customTags = Object.keys(tags).filter(t => t.startsWith('tag'));
    expect(customTags).toHaveLength(1);

    const key = customTags[0]!;
    const value = key[key.length - 1];
    expect(tags[key]).toBe(value);
  });
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;

  const loaderSpan = httpServerTransaction?.spans?.find(span => span.data && span.data['code.function'] === 'loader');
  const loaderSpanId = loaderSpan?.span_id;
  const loaderParentSpanId = loaderSpan?.parent_span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET http://localhost:3030/');
  expect(pageloadTransaction.transaction).toBe('/');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(loaderParentSpanId).toEqual(httpServerSpanId);
  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
