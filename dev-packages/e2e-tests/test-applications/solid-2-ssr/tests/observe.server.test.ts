import { expect, test } from '@playwright/test';
import { CODE_FUNCTION_NAME, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_SERVER } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('adds a span for a server function execution on observe builds', async ({ page }) => {
  test.skip(process.env.SOLID_OBSERVE !== '1', 'Only observe builds record server function executions');

  const functionSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return (
      getSpanOp(span) === FUNCTION && span.attributes?.[SENTRY_ORIGIN]?.value === 'auto.function.solid.server_function'
    );
  });
  // The server function's request span, found by its method within the trace of the function span.
  const serverSpanPromise = functionSpanPromise.then(functionSpan =>
    waitForStreamedSpan(
      'solid-2-ssr',
      span =>
        getSpanOp(span) === HTTP_SERVER &&
        span.is_segment &&
        span.trace_id === functionSpan.trace_id &&
        span.name.startsWith('POST'),
      0,
    ),
  );

  await page.goto('/');
  await page.locator('#serverFunctionErrorBtn').click();

  const [functionSpan, serverSpan] = await Promise.all([functionSpanPromise, serverSpanPromise]);

  expect(functionSpan.status).toBe('error');
  expect(functionSpan.attributes?.[CODE_FUNCTION_NAME]?.value).toEqual(expect.any(String));
  expect(functionSpan.name).toBe(functionSpan.attributes?.[CODE_FUNCTION_NAME]?.value);
  expect(functionSpan.parent_span_id).toBe(serverSpan.span_id);
});
