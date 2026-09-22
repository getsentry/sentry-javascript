import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  findErrorInTrace,
  findSpanInTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';

// Set by global-setup.mjs once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL;

test('Sends a captured exception to Sentry', async () => {
  const response = await fetch(`${workerUrl}/test-error`);
  expect(response.status).toBe(200);
  const { eventId, traceId } = await response.json();

  console.log(`Polling for error eventId ${eventId}: sentry trace view ${traceTarget(traceId)}`);

  await expect.poll(() => findErrorInTrace(traceId, eventId), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends an unhandled exception and its request span to Sentry', async () => {
  const traceId = randomBytes(16).toString('hex');
  const publicKey = new URL(process.env.E2E_TEST_DSN!).username;
  const response = await fetch(`${workerUrl}/test-unhandled-error`, {
    headers: {
      'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-public_key=${publicKey},sentry-sampled=true,sentry-sample_rate=1`,
    },
  });
  expect(response.status).toBe(500);

  console.log(`Polling for unhandled error: sentry trace view ${traceTarget(traceId)}`);

  await expect.poll(() => findErrorInTrace(traceId), EVENT_POLLING_OPTIONS).toBeDefined();
  await expect.poll(() => findSpanInTrace(traceId, 'http.server'), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends a request span to Sentry', async () => {
  const response = await fetch(`${workerUrl}/test-span`);
  expect(response.status).toBe(200);
  const { spanId, traceId } = await response.json();

  console.log(`Polling for request spanId ${spanId}: sentry trace view ${traceTarget(traceId)}`);

  await expect
    .poll(() => findSpanInTrace(traceId, 'http.server'), EVENT_POLLING_OPTIONS)
    .toMatchObject({ event_id: spanId });
});

test('Sends a Workers AI gen_ai span to Sentry', async () => {
  const response = await fetch(`${workerUrl}/test-workers-ai`);
  expect(response.status).toBe(200);
  const { traceId } = await response.json();

  console.log(`Polling for gen_ai.chat span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, 'gen_ai.chat')?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  // Sentry stores `gen_ai.response.text` as `gen_ai.output.messages`.
  await expect
    .poll(() => fetchSpanAttributes(traceId, spanId!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      'gen_ai.input.messages': expect.stringContaining('Say hi'),
      'gen_ai.output.messages': expect.stringContaining('"role":"assistant"'),
    });
});
