import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Includes the basePath in the request url of getServerSideProps errors and spans', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router getServerSideProps error with basePath';
  });
  const segmentSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return !!span.is_segment && span.name === 'GET /pages-router/gssp-error';
  });

  await request.get('/my-app/pages-router/gssp-error?q=1');

  const errorEvent = await errorEventPromise;
  const segmentSpan = await segmentSpanPromise;

  expect(errorEvent.request).toMatchObject({
    url: 'http://localhost:3030/my-app/pages-router/gssp-error?q=1',
    query_string: 'q=1',
  });
  expect(segmentSpan.attributes).toMatchObject({
    'url.full': { value: 'http://localhost:3030/my-app/pages-router/gssp-error?q=1', type: 'string' },
  });
});

test('Includes the basePath in the request url of Pages Router API route errors and spans', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Pages Router API route error with basePath';
  });
  const segmentSpanPromise = waitForStreamedSpan('nextjs-15-basepath', span => {
    return !!span.is_segment && span.name === 'GET /api/pages-router-api-error';
  });

  await request.get('/my-app/api/pages-router-api-error');

  const errorEvent = await errorEventPromise;
  const segmentSpan = await segmentSpanPromise;

  expect(errorEvent.request?.url).toBe('http://localhost:3030/my-app/api/pages-router-api-error');
  expect(segmentSpan.attributes).toMatchObject({
    'url.full': { value: 'http://localhost:3030/my-app/api/pages-router-api-error', type: 'string' },
  });
});
