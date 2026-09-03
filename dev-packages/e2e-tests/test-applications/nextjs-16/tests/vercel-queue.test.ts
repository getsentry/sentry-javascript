import test, { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// The queue E2E test only runs in production mode.
// In development mode the @vercel/queue SDK uses an in-memory dispatch that
// bypasses our mock HTTP server, causing duplicate handler invocations.
const isProduction = process.env.TEST_ENV === 'production';

test('Should create spans for queue producer and consumer', async ({ request }) => {
  test.skip(!isProduction, 'Vercel Queue test only runs in production mode');

  // 1. Set up waiters for both the producer and consumer spans.
  const producerSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'POST /api/queue-send' && span.is_segment;
  });

  const consumerSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'POST /api/queues/process-order' && span.is_segment;
  });

  // 2. Hit the producer route to enqueue a message.
  const response = await request.post('/api/queue-send', {
    data: { topic: 'orders', payload: { orderId: 'e2e-test-123', action: 'fulfill' } },
    headers: { 'Content-Type': 'application/json' },
  });

  const responseBody = await response.json();
  expect(response.status()).toBe(200);
  expect(responseBody.messageId).toBeTruthy();

  // 3. Wait for the producer span.
  const producerSpan = await producerSpanPromise;
  expect(producerSpan).toBeDefined();
  expect(getSpanOp(producerSpan)).toBe('http.server');
  expect(producerSpan.status).toBe('ok');

  // 4. Wait for the consumer span (the mock server pushes the message
  //    to the consumer route via CloudEvent POST).
  const consumerSpan = await consumerSpanPromise;
  expect(consumerSpan).toBeDefined();
  expect(getSpanOp(consumerSpan)).toBe('http.server');
  expect(consumerSpan.status).toBe('ok');

  // 5. Verify the consumer span has messaging.* attributes from queue instrumentation.
  expect(consumerSpan.attributes['messaging.system']?.value).toBe('vercel.queue');
  expect(consumerSpan.attributes['messaging.operation.name']?.value).toBe('process');
  expect(consumerSpan.attributes['messaging.destination.name']?.value).toBe('orders');
  expect(consumerSpan.attributes['messaging.message.id']?.value).toBeTruthy();
  expect(consumerSpan.attributes['messaging.consumer.group.name']?.value).toBeTruthy();
});
