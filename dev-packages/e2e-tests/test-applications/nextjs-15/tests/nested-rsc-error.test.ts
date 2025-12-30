import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const packageJson = require('../package.json');

test('Should capture errors from nested server components when `Sentry.captureRequestError` is added to the `onRequestError` hook', async ({
  page,
}) => {
  const [, minor, patch, canary] = packageJson.dependencies.next.split('.');

  test.skip(
    minor === '0' &&
      patch.startsWith('0-') &&
      ((patch.includes('canary') && Number(canary) < 63) || patch.includes('rc')),
    'Next.js version does not expose these errors',
  );

  const errorEventPromise = waitForError('nextjs-15', errorEvent => {
    return !!errorEvent?.exception?.values?.some(value => value.value === 'I am technically uncatchable');
  });

  const serverTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-rsc-error/[param]';
  });

  await page.goto(`/nested-rsc-error/123`);
  const errorEvent = await errorEventPromise;
  const serverTransactionEvent = await serverTransactionPromise;

  // error event is part of the transaction
  expect(errorEvent.contexts?.trace?.trace_id).toBe(serverTransactionEvent.contexts?.trace?.trace_id);

  expect(errorEvent.request).toMatchObject({
    headers: expect.any(Object),
    method: 'GET',
  });

  expect(errorEvent.contexts?.nextjs).toEqual({
    route_type: 'render',
    router_kind: 'App Router',
    router_path: '/nested-rsc-error/[param]',
    request_path: '/nested-rsc-error/123',
  });

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });
});
