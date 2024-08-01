import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Should capture an error thrown in a server component', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'RSC error';
  });

  await page.goto('/rsc-error');

  expect(await errorEventPromise).toMatchObject({
    contexts: {
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        trace_id: expect.any(String),
      },
    },
    event_id: expect.any(String),
    exception: {
      values: [
        {
          mechanism: { handled: false, type: 'generic' },
          type: 'Error',
          value: 'RSC error',
        },
      ],
    },
    modules: { next: '13.2.0' },
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
    },
    timestamp: expect.any(Number),
    transaction: 'Page Server Component (/rsc-error)',
  });
});
