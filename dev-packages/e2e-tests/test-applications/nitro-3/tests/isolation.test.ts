import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Isolation scope prevents tag leaking between requests', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan('nitro-3', span => {
    return span.is_segment && span.name === 'GET /api/test-isolation/:id';
  });

  const errorPromise = waitForError('nitro-3', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'Isolation test error');
  });

  await request.get('/api/test-isolation/1').catch(() => {
    // noop - route throws
  });

  const segmentSpan = await segmentSpanPromise;
  const error = await errorPromise;

  expect(segmentSpan).toBeDefined();

  // Streamed spans do not carry scope tags, so the isolation check relies on the error event
  expect(error.tags?.['my-isolated-tag']).toBe(true);
  expect(error.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
