import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should capture errors for crashing streaming promises in server components when `Sentry.captureRequestError` is added to the `onRequestError` hook', async ({
  page,
}) => {
  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return !!errorEvent?.exception?.values?.some(value => value.value === 'I am a data streaming error');
  });

  // Matched on the error's own trace so a span from an earlier spec cannot satisfy the correlation.
  const serverSpanPromise = waitForStreamedSpan('nextjs-16', async span => {
    return (
      span.name === 'GET /streaming-rsc-error/[param]' &&
      span.is_segment &&
      (await errorEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  // The streaming RSC error can interrupt the HTTP response, causing the navigation to reject
  // (e.g. net::ERR_ABORTED) even though the error and transaction are still captured.
  await page.goto(`/streaming-rsc-error/123`).catch(() => {});
  const errorEvent = await errorEventPromise;
  const serverSpan = await serverSpanPromise;

  // error event is part of the same trace as the server span
  expect(errorEvent.contexts?.trace?.trace_id).toBe(serverSpan.trace_id);

  expect(errorEvent.request).toMatchObject({
    headers: expect.any(Object),
    method: 'GET',
  });

  expect(errorEvent.contexts?.nextjs).toEqual({
    route_type: 'render',
    router_kind: 'App Router',
    router_path: '/streaming-rsc-error/[param]',
    request_path: '/streaming-rsc-error/123',
  });

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });
});
