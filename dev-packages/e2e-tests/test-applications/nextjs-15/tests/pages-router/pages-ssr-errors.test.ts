import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { skipTurbopack } from './skipTurbopack';

skipTurbopack();

test('Will capture error for SSR rendering error with a connected trace (Class Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-15', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error Class';
  });

  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-15', async span => {
    return (
      span.name === 'GET /pages-router/ssr-error-class' &&
      span.is_segment &&
      (await errorEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  await page.goto('/pages-router/ssr-error-class');

  expect(await errorEventPromise).toBeDefined();
  expect(await serverComponentSpanPromise).toBeDefined();
});

test('Will capture error for SSR rendering error with a connected trace (Functional Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-15', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error FC';
  });

  const ssrSpanPromise = waitForStreamedSpan('nextjs-15', async span => {
    return (
      span.name === 'GET /pages-router/ssr-error-fc' &&
      span.is_segment &&
      (await errorEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  await page.goto('/pages-router/ssr-error-fc');

  const errorEvent = await errorEventPromise;
  await ssrSpanPromise;

  // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
  // asserted on the error event.
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.page_function',
  });
});
