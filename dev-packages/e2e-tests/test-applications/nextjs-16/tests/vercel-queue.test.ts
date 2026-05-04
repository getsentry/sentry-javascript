import test, { expect } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';

// The queue E2E test only runs in production mode.
// In development mode the @vercel/queue SDK uses an in-memory dispatch that
// bypasses our mock HTTP server, causing duplicate handler invocations.
const isProduction = process.env.TEST_ENV === 'production';

test('Should create transactions for queue producer and consumer', async ({ request }) => {
  test.skip(!isProduction, 'Vercel Queue test only runs in production mode');

  // 1. Set up waiters for both the producer and consumer root spans.
  const producerRootSpanPromise = waitForRootSpan('nextjs-16', rootSpan => {
    return rootSpan.name === 'POST /api/queue-send';
  });

  const consumerRootSpanPromise = waitForRootSpan('nextjs-16', rootSpan => {
    return rootSpan.name === 'POST /api/queues/process-order';
  });

  // 2. Hit the producer route to enqueue a message.
  const response = await request.post('/api/queue-send', {
    data: { topic: 'orders', payload: { orderId: 'e2e-test-123', action: 'fulfill' } },
    headers: { 'Content-Type': 'application/json' },
  });

  const responseBody = await response.json();
  expect(response.status()).toBe(200);
  expect(responseBody.messageId).toBeTruthy();

  // 3. Wait for the producer root span.
  const producerRootSpan = await producerRootSpanPromise;
  expect(producerRootSpan).toBeDefined();
  expect(producerRootSpan.op).toBe('http.server');
  expect(producerRootSpan.status).toBe('ok');

  // 4. Wait for the consumer root span (the mock server pushes the message
  //    to the consumer route via CloudEvent POST).
  const consumerRootSpan = await consumerRootSpanPromise;
  expect(consumerRootSpan).toBeDefined();
  expect(consumerRootSpan.op).toBe('http.server');
  expect(consumerRootSpan.status).toBe('ok');

  // 5. Verify the consumer span has messaging.* attributes from queue instrumentation.
  expect(consumerRootSpan.attributes['messaging.system']).toBe('vercel.queue');
  expect(consumerRootSpan.attributes['messaging.operation.name']).toBe('process');
  expect(consumerRootSpan.attributes['messaging.destination.name']).toBe('orders');
  expect(consumerRootSpan.attributes['messaging.message.id']).toBeTruthy();
  expect(consumerRootSpan.attributes['messaging.consumer.group.name']).toBeTruthy();
});
