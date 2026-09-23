import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  EVENT_POLLING_OPTIONS,
  fetchTrace,
  findErrorInTrace,
  findSpanInTrace,
  flattenTrace,
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

test('Sends the spans of Workflow steps before the Workflow goes to sleep', async () => {
  const response = await fetch(`${workerUrl}/test-workflow-sleep`);
  expect(response.status).toBe(200);
  const { instanceId, traceId } = await response.json();

  console.log(`Polling for the Workflow step spans: sentry trace view ${traceTarget(traceId)}`);

  await expect
    .poll(
      () =>
        flattenTrace(fetchTrace(traceId)).filter(
          item => item.event_type === 'span' && item.op === 'function' && item.description?.startsWith('before-sleep-'),
        ).length,
      EVENT_POLLING_OPTIONS,
    )
    .toBe(3);

  const { status } = await fetch(`${workerUrl}/test-workflow-status?id=${instanceId}`).then(res => res.json());
  expect(['running', 'waiting']).toContain(status);
});
