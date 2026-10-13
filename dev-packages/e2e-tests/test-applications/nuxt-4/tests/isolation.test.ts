import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('keeps the scope data of concurrent requests apart', async ({ request }) => {
  const tags = ['alpha', 'beta', 'gamma'];

  const errorPromises = tags.map(tag =>
    waitForError('nuxt-4', errorEvent => errorEvent.exception?.values?.[0]?.value === `Isolation error ${tag}`),
  );

  await Promise.all(tags.map(tag => request.get(`/api/isolation?tag=${tag}`)));

  const errorEvents = await Promise.all(errorPromises);

  errorEvents.forEach((errorEvent, index) => {
    expect(errorEvent.tags?.['isolation-tag']).toBe(tags[index]);
    expect(errorEvent.transaction).toBe('GET /api/isolation');
  });

  const traceIds = errorEvents.map(errorEvent => errorEvent.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(tags.length);
});
