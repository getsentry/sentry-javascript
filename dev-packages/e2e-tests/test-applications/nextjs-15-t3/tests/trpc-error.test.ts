import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should capture error with trpc context', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-15-t3', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Error thrown in trpc router';
  });

  await page.goto('/');
  await page.click('#error-button');

  const trpcError = await errorEventPromise;

  expect(trpcError).toBeDefined();
  expect(trpcError.contexts?.trpc).toBeDefined();
  expect(trpcError.contexts?.trpc?.procedure_type).toEqual('mutation');
  expect(trpcError.contexts?.trpc?.procedure_path).toBe('post.throwError');
  expect(trpcError.contexts?.trpc?.input).toEqual({ name: 'I love dogs' });

  const exceptionValues = trpcError.exception?.values;
  expect(exceptionValues).toHaveLength(2);
  expect(exceptionValues?.[0]?.type).toBe('Error');
  expect(exceptionValues?.[0]?.value).toBe('Error thrown in trpc router');
  expect(exceptionValues?.[0]?.mechanism).toEqual({
    handled: true,
    type: 'chained',
    exception_id: 1,
    parent_id: 0,
    source: 'cause',
  });
  expect(exceptionValues?.[1]?.mechanism).toEqual({
    handled: false,
    type: 'auto.rpc.trpc.middleware',
    exception_id: 0,
  });
});

test('should create span with trpc input for error', async ({ page }) => {
  const trpcSpanPromise = waitForStreamedSpan('nextjs-15-t3', span => {
    return span.name === 'POST /api/trpc/[trpc]' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await page.goto('/');
  await page.click('#error-button');

  const trpcSpan = await trpcSpanPromise;
  expect(trpcSpan).toBeDefined();
});
