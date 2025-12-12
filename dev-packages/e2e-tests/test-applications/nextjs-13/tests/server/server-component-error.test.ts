import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Should capture an error thrown in a server component', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'RSC error';
  });

  // This page returns an error status code, so we need to catch the navigation error
  await page.goto('/rsc-error').catch(() => {
    // Expected to fail with net::ERR_HTTP_RESPONSE_CODE_FAILURE in newer Chromium versions
  });

  expect(await errorEventPromise).toMatchObject({
    contexts: {
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    event_id: expect.any(String),
    exception: {
      values: [
        {
          mechanism: { handled: false, type: 'auto.function.nextjs.server_component' },
          type: 'Error',
          value: 'RSC error',
        },
      ],
    },
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
    },
    timestamp: expect.any(Number),
    transaction: 'Page Server Component (/rsc-error)',
  });
});
