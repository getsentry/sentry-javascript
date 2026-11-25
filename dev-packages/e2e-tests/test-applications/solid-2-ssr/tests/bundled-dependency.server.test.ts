import { expect, test } from '@playwright/test';
import { GRAPHQL_OPERATION_NAME, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { GRAPHQL, HTTP_SERVER } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('instruments a dependency the server build bundles', async ({ page }) => {
  const graphqlSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === GRAPHQL && span.attributes?.[GRAPHQL_OPERATION_NAME]?.value === 'Hello';
  });
  // The server function's request span. It continues the pageload's trace, as the page request does, so it is
  // found by its method within the trace of the graphql span.
  const serverSpanPromise = graphqlSpanPromise.then(graphqlSpan =>
    waitForStreamedSpan(
      'solid-2-ssr',
      span =>
        getSpanOp(span) === HTTP_SERVER &&
        span.is_segment &&
        span.trace_id === graphqlSpan.trace_id &&
        span.name.startsWith('POST'),
      0,
    ),
  );

  await page.goto('/');
  await page.locator('#graphqlBtn').click();
  await expect(page.locator('#result')).toHaveText('world');

  const [graphqlSpan, serverSpan] = await Promise.all([graphqlSpanPromise, serverSpanPromise]);

  expect(graphqlSpan.attributes?.[SENTRY_ORIGIN]?.value).toMatch(/^auto\.graphql\./);
  expect(graphqlSpan.parent_span_id).toBeDefined();
  expect(serverSpan.status).not.toBe('error');
});
