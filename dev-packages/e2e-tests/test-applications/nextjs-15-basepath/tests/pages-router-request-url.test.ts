import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Includes the basePath in the request url of getServerSideProps errors', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router getServerSideProps error with basePath';
  });

  await request.get('/my-app/pages-router/gssp-error?q=1');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.request).toMatchObject({
    url: 'http://localhost:3030/my-app/pages-router/gssp-error?q=1',
    query_string: 'q=1',
  });
});

test('Includes the basePath in the request url of Pages Router API route errors', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router API route error with basePath';
  });

  await request.get('/my-app/api/pages-router-api-error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.request?.url).toBe('http://localhost:3030/my-app/api/pages-router-api-error');
});
