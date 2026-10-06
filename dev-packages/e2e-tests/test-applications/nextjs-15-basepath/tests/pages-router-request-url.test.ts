import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Includes the basePath in the request url of getServerSideProps errors and transactions', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router getServerSideProps error with basePath';
  });
  const transactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && !!transactionEvent.request?.url?.includes('gssp-error')
    );
  });

  await request.get('/my-app/pages-router/gssp-error?q=1');

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  expect(errorEvent.request).toMatchObject({
    url: 'http://localhost:3030/my-app/pages-router/gssp-error?q=1',
    query_string: 'q=1',
  });
  expect(transactionEvent.request).toMatchObject({
    url: 'http://localhost:3030/my-app/pages-router/gssp-error',
    query_string: 'q=1',
  });
});

test('Includes the basePath in the request url of Pages Router API route errors and transactions', async ({
  request,
}) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router API route error with basePath';
  });
  const transactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent.request?.url?.includes('pages-router-api-error')
    );
  });

  await request.get('/my-app/api/pages-router-api-error');

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  expect(errorEvent.request?.url).toBe('http://localhost:3030/my-app/api/pages-router-api-error');
  expect(transactionEvent.request?.url).toBe('http://localhost:3030/my-app/api/pages-router-api-error');
});
