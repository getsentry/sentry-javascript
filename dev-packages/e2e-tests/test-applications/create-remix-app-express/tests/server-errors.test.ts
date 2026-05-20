import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a loader error to Sentry', async ({ page }) => {
  const loaderErrorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Loader Error';
  });

  await page.goto('/loader-error');

  const loaderError = await loaderErrorPromise;

  expect(loaderError).toBeDefined();
});

test('Reports an error thrown from a loader with handleError mechanism', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.transaction === 'GET loader-json-response/:id' && txn.contexts?.trace?.status === 'internal_error';
  });
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return (
      errorEvent.exception?.values?.[0]?.value === 'Unexpected Server Error' &&
      errorEvent.exception?.values?.[0]?.mechanism?.data?.function === 'remix.server.handleError'
    );
  });

  await page.goto('/loader-json-response/-2').catch(() => {});

  const transaction = await transactionPromise;
  const errorEvent = await errorPromise;

  expect(transaction.contexts?.trace?.data?.['http.response.status_code']).toBe(500);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    handled: false,
    type: 'auto.function.remix.server',
    data: { function: 'remix.server.handleError' },
  });
});

test('Reports a thrown Response from a loader', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return (
      errorEvent.exception?.values?.[0]?.value === 'Not found' &&
      errorEvent.exception?.values?.[0]?.mechanism?.data?.function === 'loader'
    );
  });

  await page.goto('/loader-throw-response/-1').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    handled: false,
    type: 'auto.function.remix.server',
    data: { function: 'loader' },
  });
});

test('Reports an error in the redirection target loader', async ({ page }) => {
  // Same payload as the direct-loader-error test; serial execution + timestamp
  // gating in the proxy ensures this listener only matches the event emitted
  // for this test.
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return (
      errorEvent.platform === 'node' &&
      errorEvent.exception?.values?.[0]?.value === 'Unexpected Server Error' &&
      errorEvent.exception?.values?.[0]?.mechanism?.data?.function === 'remix.server.handleError'
    );
  });

  await page.goto('/loader-json-response/-1').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});

test('Reports an error thrown from an action', async ({ request }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return txn.transaction === 'POST action-json-response/:id' && txn.contexts?.trace?.status === 'internal_error';
  });
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return (
      errorEvent.platform === 'node' &&
      errorEvent.request?.method === 'POST' &&
      errorEvent.exception?.values?.[0]?.value === 'Unexpected Server Error' &&
      errorEvent.exception?.values?.[0]?.mechanism?.data?.function === 'remix.server.handleError'
    );
  });

  await request.post('/action-json-response/-1').catch(() => {});

  const transaction = await transactionPromise;
  const errorEvent = await errorPromise;

  expect(transaction.contexts?.trace?.data?.['http.response.status_code']).toBe(500);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    handled: false,
    type: 'auto.function.remix.server',
  });
});

test('Reports a thrown json() error response with statusText', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Sentry Test Error';
  });

  await request.post('/action-json-response/-3').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    handled: false,
    type: 'auto.function.remix.server',
    data: { function: 'action' },
  });
});

test('Reports a thrown json() error response with object body', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Object captured as exception with keys: data';
  });

  await request.post('/action-json-response/-4').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toBe('action');
});

test('Reports a thrown json() error response with string body', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Sentry Test Error [string body]';
  });

  await request.post('/action-json-response/-5').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toBe('action');
});

test('Reports a thrown json() error response with an empty object body', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Object captured as exception with keys: [object has no keys]';
  });

  await request.post('/action-json-response/-6').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toBe('action');
});

test('Reports a thrown string primitive from an action', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Thrown String Error';
  });

  await request.post('/server-side-unexpected-errors/-1').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toBe('remix.server.handleError');
});

test('Reports a thrown plain object from an action', async ({ request }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Thrown Object Error';
  });

  await request.post('/server-side-unexpected-errors/-2').catch(() => {});

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toBe('remix.server.handleError');
});

test('Reports an SSR error and applies tags from wrapHandleErrorWithSentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', txn => {
    return (
      txn.transaction === 'GET ssr-error' &&
      txn.contexts?.trace?.status === 'internal_error' &&
      txn.tags?.['remix-test-tag'] === 'remix-test-value'
    );
  });
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Sentry SSR Test Error';
  });

  await page.goto('/ssr-error').catch(() => {});

  const transaction = await transactionPromise;
  const errorEvent = await errorPromise;

  expect(transaction.contexts?.trace?.data?.['http.response.status_code']).toBe(500);
  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    handled: false,
    type: 'auto.function.remix.server',
    data: { function: 'remix.server.handleError' },
  });
});

test('Does not report a thrown redirect response on the server', async ({ page }) => {
  let serverErrorReceived = false;

  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    if (errorEvent.platform === 'node') {
      serverErrorReceived = true;
      return true;
    }
    return false;
  });

  await page.goto('/throw-redirect');

  await Promise.race([errorPromise, new Promise(resolve => setTimeout(resolve, 3000))]);

  expect(serverErrorReceived).toBe(false);
});
