import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Includes sentry-trace and baggage in response headers', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-success`);

  const sentryTrace = response.headers.get('sentry-trace');
  const baggage = response.headers.get('baggage');

  expect(sentryTrace).toMatch(/[a-f0-9]{32}-[a-f0-9]{16}-[01]/);
  expect(baggage).toContain('sentry-environment=qa');
  expect(baggage).toContain('sentry-trace_id=');
});

// Bun's native fetch does not emit undici diagnostics channels,
// so the nativeNodeFetchIntegration cannot inject sentry-trace/baggage headers.
// These tests document the desired behavior and will pass once Bun adds support
// for undici diagnostics channels or an alternative propagation mechanism is added.

test.fixme('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const id = randomUUID();

  const inboundTransactionPromise = waitForTransaction('elysia-node', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-inbound-headers/:id'
    );
  });

  const outboundTransactionPromise = waitForTransaction('elysia-node', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-outgoing-fetch/:id'
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch/${id}`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  expect(traceId).toEqual(expect.any(String));

  // Verify sentry-trace header was propagated to the inbound request
  const inboundHeaderSentryTrace = data.headers?.['sentry-trace'];
  const inboundHeaderBaggage = data.headers?.['baggage'];

  expect(inboundHeaderSentryTrace).toMatch(new RegExp(`^${traceId}-[a-f0-9]{16}-1$`));
  expect(inboundHeaderBaggage).toBeDefined();

  const baggage = (inboundHeaderBaggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );

  // Both transactions should share the same trace ID
  expect(inboundTransaction.contexts?.trace?.trace_id).toBe(traceId);
});

test.fixme('Propagates trace for outgoing fetch to external allowed URL', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('elysia-node', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-outgoing-fetch-external-allowed'
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-allowed`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;
  const traceId = inboundTransaction?.contexts?.trace?.trace_id;

  expect(traceId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-allowed');
  expect(data.headers?.['sentry-trace']).toMatch(/[a-f0-9]{32}-[a-f0-9]{16}-1/);
  expect(data.headers?.baggage).toBeDefined();

  const baggage = (data.headers.baggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );
});

test('Does not propagate outgoing fetch requests not covered by tracePropagationTargets', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('elysia-node', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-outgoing-fetch-external-disallowed'
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-disallowed`);
  const data = await response.json();

  await inboundTransactionPromise;

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});
