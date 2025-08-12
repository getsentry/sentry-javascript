import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('errors on frontend and backend are connected by the same trace', async ({ page }) => {
  const clientErrorPromise = waitForError('sveltekit-2.5.0-twp', evt => {
    return evt.exception?.values?.[0].value === 'Client Error';
  });

  const serverErrorPromise = waitForError('sveltekit-2.5.0-twp', evt => {
    return evt.exception?.values?.[0].value === 'No search query provided';
  });

  await page.goto('/errors');

  const clientError = await clientErrorPromise;
  const serverError = await serverErrorPromise;

  expect(clientError).toMatchObject({
    contexts: {
      trace: {
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    exception: {
      values: [
        {
          mechanism: {
            handled: false,
            type: 'auto.browser.global_handlers.onunhandledrejection',
          },
          stacktrace: expect.any(Object),
          type: 'Error',
          value: 'Client Error',
        },
      ],
    },
    level: 'error',
    platform: 'javascript',
    release: '1.0.0',
    timestamp: expect.any(Number),
    transaction: '/errors',
  });

  expect(serverError).toMatchObject({
    contexts: {
      trace: {
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    exception: {
      values: [
        {
          mechanism: {
            handled: true,
            type: 'generic',
          },
          stacktrace: {},
        },
      ],
    },
    platform: 'node',
    timestamp: expect.any(Number),
    transaction: 'GET /errors',
  });

  const clientTraceId = clientError.contexts?.trace?.trace_id;
  const serverTraceId = serverError.contexts?.trace?.trace_id;

  expect(clientTraceId).toBe(serverTraceId);
});
