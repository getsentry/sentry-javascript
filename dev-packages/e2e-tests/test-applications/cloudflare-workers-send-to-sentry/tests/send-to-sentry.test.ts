import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { EVENT_POLLING_OPTIONS, findErrorInTrace, findSpanInTrace, traceTarget } from '@sentry-internal/test-utils/cli';

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
  // The worker cannot report ids for a request it fails, so the test picks the trace id and the
  // SDK continues it from the incoming headers. Relay drops streamed spans of a trace without a
  // dynamic sampling context, so `baggage` has to come along with `sentry-trace`.
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
