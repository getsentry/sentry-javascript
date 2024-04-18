import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Propagates trace for outgoing http requests', async ({ baseURL, request }) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http';
  });

  await request.get(`${baseURL}/propagation/test-outgoing-http`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(typeof inboundTransaction.contexts?.trace?.trace_id).toBe('string');
  expect(inboundTransaction.contexts?.trace?.trace_id).toBe(outboundTransaction.contexts?.trace?.trace_id);
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL, request }) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch';
  });

  await request.get(`${baseURL}/propagation/test-outgoing-fetch`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(typeof inboundTransaction.contexts?.trace?.trace_id).toBe('string');
  expect(inboundTransaction.contexts?.trace?.trace_id).toBe(outboundTransaction.contexts?.trace?.trace_id);
});

test('Does not propagate outgoing http requests not covered by tracePropagationTargets', async ({
  baseURL,
  request,
}) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http-external-disallowed/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http-external-disallowed';
  });

  await request.get(`${baseURL}/propagation/test-outgoing-http-external-disallowed`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(typeof outboundTransaction.contexts?.trace?.trace_id).toBe('string');
  expect(inboundTransaction.contexts?.trace?.trace_id).not.toBe(outboundTransaction.contexts?.trace?.trace_id);
});

test('Does not propagate outgoing fetch requests not covered by tracePropagationTargets', async ({
  baseURL,
  request,
}) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch-external-disallowed/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch-external-disallowed';
  });

  await request.get(`${baseURL}/propagation/test-outgoing-fetch-external-disallowed`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(typeof outboundTransaction.contexts?.trace?.trace_id).toBe('string');
  expect(inboundTransaction.contexts?.trace?.trace_id).not.toBe(outboundTransaction.contexts?.trace?.trace_id);
});
