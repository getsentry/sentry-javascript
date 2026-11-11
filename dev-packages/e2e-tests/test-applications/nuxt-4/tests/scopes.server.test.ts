import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';

test.skip(isViteServer, NITRO_ONLY);

test('isolates the scope data and trace of concurrent requests', async ({ request }) => {
  const tags = ['alpha', 'beta', 'gamma'];
  const eventPromises = tags.map(tag => waitForError('nuxt-4', event => event.message === `isolation ${tag}`));

  await Promise.all(tags.map(tag => request.get(`/api/isolation?tag=${tag}`)));
  const events = await Promise.all(eventPromises);

  events.forEach((event, index) => {
    expect(event.tags?.['isolation-tag']).toBe(tags[index]);
    expect(event.transaction).toBe('GET /api/isolation');
  });
  expect(new Set(events.map(event => event.contexts?.trace?.trace_id)).size).toBe(tags.length);
});
