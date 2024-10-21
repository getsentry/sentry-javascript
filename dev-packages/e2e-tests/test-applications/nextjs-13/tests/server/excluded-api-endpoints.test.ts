import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// TODO(lforst): This cannot make it into production - Make sure to fix this test
// The problem is that if we are not applying build time instrumentation Next.js will still emit spans (which is fine, but we need to find a different way of testing that build time instrumentation is successfully disabled - maybe with an attribute or something if build-time instrumentation is applied)
test.skip('should not automatically create transactions for routes that were excluded from auto wrapping (string)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-string' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  expect(await (await request.get(`/api/endpoint-excluded-with-string`)).text()).toBe('{"success":true}');

  let transactionPromiseReceived = false;
  transactionPromise.then(() => {
    transactionPromiseReceived = true;
  });

  await new Promise(resolve => setTimeout(resolve, 5_000));

  expect(transactionPromiseReceived).toBe(false);
});

// TODO(lforst): This cannot make it into production - Make sure to fix this test
// The problem is that if we are not applying build time instrumentation Next.js will still emit spans (which is fine, but we need to find a different way of testing that build time instrumentation is successfully disabled - maybe with an attribute or something if build-time instrumentation is applied)
test.skip('should not automatically create transactions for routes that were excluded from auto wrapping (regex)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-regex' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  expect(await (await request.get(`/api/endpoint-excluded-with-regex`)).text()).toBe('{"success":true}');

  let transactionPromiseReceived = false;
  transactionPromise.then(() => {
    transactionPromiseReceived = true;
  });

  await new Promise(resolve => setTimeout(resolve, 5_000));

  expect(transactionPromiseReceived).toBe(false);
});
