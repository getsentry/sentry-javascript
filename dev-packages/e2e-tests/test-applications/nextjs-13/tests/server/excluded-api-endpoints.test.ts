import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should not apply build-time instrumentation for routes that were excluded from auto wrapping (string)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-string' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  expect(await (await request.get(`/api/endpoint-excluded-with-string`)).text()).toBe('{"success":true}');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.origin']).toBeDefined();
  expect(transaction.contexts?.trace?.data?.['sentry.origin']).not.toBe('auto.http.nextjs'); // This is the origin set by the build time instrumentation
});

test('should not apply build-time instrumentation for routes that were excluded from auto wrapping (regex)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-regex' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  expect(await (await request.get(`/api/endpoint-excluded-with-regex`)).text()).toBe('{"success":true}');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data?.['sentry.origin']).toBeDefined();
  expect(transaction.contexts?.trace?.data?.['sentry.origin']).not.toBe('auto.http.nextjs'); // This is the origin set by the build time instrumentation
});
