import { expect, test } from '@playwright/test';
import { waitForError, waitForRootSpan } from '@sentry-internal/test-utils';

test('Should capture errors for crashing streaming promises in server components when `Sentry.captureRequestError` is added to the `onRequestError` hook', async ({
  page,
}) => {
  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return !!errorEvent?.exception?.values?.some(value => value.value === 'I am a data streaming error');
  });

  const serverRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /streaming-rsc-error/[param]';
  });

  await page.goto(`/streaming-rsc-error/123`);
  const errorEvent = await errorEventPromise;
  const serverRootSpan = await serverRootSpanPromise;

  // error event is part of the transaction
  expect(errorEvent.contexts?.trace?.trace_id).toBe(serverRootSpan.traceId);

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
