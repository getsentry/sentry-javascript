import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getRuntime, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';
import { isVinext } from './isVinext';

test('Should send a span for instrumented server actions', async ({ page }) => {
  const serverActionSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'myServerAction' && span.is_segment;
  });

  await page.goto('/server-action');
  await page.getByText('Run Action').click();

  const span = await serverActionSpanPromise;

  expect(span).toBeDefined();
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.function.nextjs.server_action', type: 'string' },
    'sentry.description': { value: 'serverAction/myServerAction', type: 'string' },
    'code.function.name': { value: 'myServerAction', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });
});

test('Should send a wrapped server action as a child of a nextjs span', async ({ page }) => {
  test.skip(isDevMode, 'this magically only works in production');
  test.skip(isVinext, 'vinext emits no request span for the server action POST');

  // On Workers the request span comes from `withSentry`
  const requestSpanOrigin = getRuntime() === 'cloudflare' ? 'auto.http.cloudflare' : 'auto';

  // Both spans must come from the same trace. Other specs on this page produce identically shaped
  // `POST /server-action` and `myServerAction` spans, so requiring both within one
  // `collectStreamedSpans` - which evaluates a single trace at a time - keeps them paired.
  const spansPromise = collectStreamedSpans('nextjs-16', spans => {
    return (
      spans.some(
        span =>
          span.name === 'POST /server-action' &&
          span.is_segment &&
          span.attributes['sentry.origin']?.value === requestSpanOrigin,
      ) && spans.some(span => span.name === 'myServerAction' && span.is_segment)
    );
  });

  await page.goto('/server-action');
  await page.getByText('Run Action').click();

  const spans = await spansPromise;
  const nextjsSpan = spans.find(
    span =>
      span.name === 'POST /server-action' &&
      span.is_segment &&
      span.attributes['sentry.origin']?.value === requestSpanOrigin,
  )!;
  const serverActionSpan = spans.find(span => span.name === 'myServerAction' && span.is_segment)!;

  expect(nextjsSpan).toBeDefined();
  expect(serverActionSpan).toBeDefined();

  expect(nextjsSpan.span_id).toBe(serverActionSpan.parent_span_id);
});

test('Should set not_found status for server actions calling notFound()', async ({ page }) => {
  const serverActionSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'notFoundServerAction' && span.is_segment;
  });

  await page.goto('/server-action');
  await page.getByText('Run NotFound Action').click();

  const span = await serverActionSpanPromise;

  expect(span).toBeDefined();
  expect(span.attributes['sentry.status.message']?.value).toBe('not_found');
});

test('Should not capture "NEXT_REDIRECT" control-flow errors for server actions calling redirect()', async ({
  page,
}) => {
  const serverActionSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'redirectServerAction' && span.is_segment;
  });

  let controlFlowErrorCaptured = false;
  void waitForError('nextjs-16', errorEvent => {
    if (errorEvent.exception?.values?.[0].value === 'NEXT_REDIRECT') {
      controlFlowErrorCaptured = true;
    }

    return false;
  });

  await page.goto('/server-action');
  await page.getByText('Run Redirect Action').click();

  const serverActionSpan = await serverActionSpanPromise;
  expect(serverActionSpan).toBeDefined();

  // Redirects are normal control flow, so the span must not be flagged as errored
  expect(serverActionSpan.status).toBe('ok');

  // By the time the server action span finishes the error should already have been sent
  expect(controlFlowErrorCaptured).toBe(false);
});
