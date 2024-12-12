import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Propagates trace for outgoing http requests', async ({ baseURL, request }) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-http';
  });

  const { headers } = await (await request.get(`${baseURL}/propagation/test-outgoing-http`)).json();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(inboundTransaction.contexts?.trace?.trace_id).toStrictEqual(expect.any(String));
  expect(inboundTransaction.contexts?.trace?.trace_id).toBe(outboundTransaction.contexts?.trace?.trace_id);

  const httpClientSpan = outboundTransaction.spans?.find(span => span.op === 'http.client');

  expect(httpClientSpan).toBeDefined();
  expect(httpClientSpan?.span_id).toStrictEqual(expect.any(String));
  expect(inboundTransaction.contexts?.trace?.parent_span_id).toBe(httpClientSpan?.span_id);

  expect(headers).toMatchObject({
    baggage: expect.any(String),
    'sentry-trace': `${outboundTransaction.contexts?.trace?.trace_id}-${httpClientSpan?.span_id}-1`,
  });
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL, request }) => {
  const inboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch/check';
  });

  const outboundTransactionPromise = waitForTransaction('nextjs-14', transactionEvent => {
    return transactionEvent.transaction === 'GET /propagation/test-outgoing-fetch';
  });

  const { headers } = await (await request.get(`${baseURL}/propagation/test-outgoing-fetch`)).json();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(inboundTransaction.contexts?.trace?.trace_id).toStrictEqual(expect.any(String));
  expect(inboundTransaction.contexts?.trace?.trace_id).toBe(outboundTransaction.contexts?.trace?.trace_id);

  const httpClientSpan = outboundTransaction.spans?.find(
    span => span.op === 'http.client' && span.data?.['sentry.origin'] === 'auto.http.otel.node_fetch',
  );

  // Right now we assert that the OTEL span is the last span before propagating
  expect(httpClientSpan).toBeDefined();
  expect(httpClientSpan?.span_id).toStrictEqual(expect.any(String));
  expect(inboundTransaction.contexts?.trace?.parent_span_id).toBe(httpClientSpan?.span_id);

  expect(headers).toMatchObject({
    baggage: expect.any(String),
    'sentry-trace': `${outboundTransaction.contexts?.trace?.trace_id}-${httpClientSpan?.span_id}-1`,
  });
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

  const { headers } = await (await request.get(`${baseURL}/propagation/test-outgoing-http-external-disallowed`)).json();

  expect(headers.baggage).toBeUndefined();
  expect(headers['sentry-trace']).toBeUndefined();

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

  const { headers } = await (
    await request.get(`${baseURL}/propagation/test-outgoing-fetch-external-disallowed`)
  ).json();

  expect(headers.baggage).toBeUndefined();
  expect(headers['sentry-trace']).toBeUndefined();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  expect(typeof outboundTransaction.contexts?.trace?.trace_id).toBe('string');
  expect(inboundTransaction.contexts?.trace?.trace_id).not.toBe(outboundTransaction.contexts?.trace?.trace_id);
});
