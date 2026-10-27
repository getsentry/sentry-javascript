import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_DECIDE, HTTP_SERVER } from '@sentry/conventions/op';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findErrorInTrace,
  findSpanInTrace,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';
import { fetchFromWorker } from '@sentry-internal/test-utils/cloudflare';

// Set by global-setup.ts once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL;

test('Sends a captured exception to Sentry', async () => {
  const { eventId, traceId }: { eventId: string; traceId: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-error`, 200),
  );

  console.log(`Polling for error eventId ${eventId}: sentry trace view ${traceTarget(traceId)}`);

  await expect.poll(() => findErrorInTrace(traceId, eventId), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends an unhandled exception and its request span to Sentry', async () => {
  const traceId = randomBytes(16).toString('hex');
  const publicKey = new URL(process.env.E2E_TEST_DSN!).username;
  await fetchFromWorker(`${workerUrl}/test-unhandled-error`, 500, {
    headers: {
      'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-public_key=${publicKey},sentry-sampled=true,sentry-sample_rate=1`,
    },
  });

  console.log(`Polling for unhandled error: sentry trace view ${traceTarget(traceId)}`);

  await expect.poll(() => findErrorInTrace(traceId), EVENT_POLLING_OPTIONS).toBeDefined();
  await expect.poll(() => findSpanInTrace(traceId, HTTP_SERVER), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends a request span to Sentry', async () => {
  const { spanId, traceId }: { spanId: string; traceId: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-span`, 200),
  );

  console.log(`Polling for request spanId ${spanId}: sentry trace view ${traceTarget(traceId)}`);

  await expect
    .poll(() => findSpanInTrace(traceId, HTTP_SERVER), EVENT_POLLING_OPTIONS)
    .toMatchObject({ event_id: spanId });
});

test('Sends the spans of Workflow steps before the Workflow goes to sleep', async () => {
  const { instanceId, traceId }: { instanceId: string; traceId: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-workflow-sleep`, 200),
  );

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

  const { status }: { status: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-workflow-status?id=${instanceId}`, 200),
  );
  expect(['running', 'waiting']).toContain(status);
});

test('Sends a Workers AI gen_ai span to Sentry', async () => {
  const { traceId }: { traceId: string } = JSON.parse(await fetchFromWorker(`${workerUrl}/test-workers-ai`, 200));

  console.log(`Polling for gen_ai.chat span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_CHAT)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  // Sentry stores `gen_ai.response.text` as `gen_ai.output.messages`.
  await expect
    .poll(() => fetchSpanAttributes(traceId, spanId!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [GEN_AI_INPUT_MESSAGES]: expect.stringContaining('Say hi'),
      [GEN_AI_OUTPUT_MESSAGES]: expect.stringContaining('"role":"assistant"'),
    });
});

test('Sends a Workers AI gen_ai.decide span for a TypeSafe Jev call to Sentry', async () => {
  const { traceId }: { traceId: string } = JSON.parse(await fetchFromWorker(`${workerUrl}/test-workers-ai-jev`, 200));

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  await expect
    .poll(() => fetchSpanAttributes(traceId, spanId!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [GEN_AI_OPERATION_NAME]: 'decide',
      [GEN_AI_REQUEST_MODEL]: 'typesafe/jev',
      [GEN_AI_RESPONSE_MODEL]: expect.stringMatching(/^jev-/),
      [GEN_AI_INPUT_MESSAGES]: expect.stringContaining('My payouts have been failing'),
      [GEN_AI_OUTPUT_MESSAGES]: expect.stringContaining('"is_urgent"'),
    });
});

test('Sends a Workers AI gen_ai.decide span for a Clef call to Sentry', async () => {
  const { traceId }: { traceId: string } = JSON.parse(await fetchFromWorker(`${workerUrl}/test-workers-ai-clef`, 200));

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  await expect
    .poll(() => fetchSpanAttributes(traceId, spanId!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [GEN_AI_OPERATION_NAME]: 'decide',
      [GEN_AI_REQUEST_MODEL]: '@cf/cloudflare/clef',
      [GEN_AI_RESPONSE_MODEL]: expect.stringContaining('clef'),
      [GEN_AI_INPUT_MESSAGES]: expect.stringContaining('Checkout has been failing'),
      [GEN_AI_OUTPUT_MESSAGES]: expect.stringContaining('"urgent"'),
    });
});

test('Sends a Workers AI gen_ai.extract span for a Clairic call to Sentry', async () => {
  const { traceId }: { traceId: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-workers-ai-clairic`, 200),
  );

  console.log(`Polling for gen_ai.extract span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  // TODO: Use `GEN_AI_EXTRACT` from `@sentry/conventions/op` once getsentry/sentry-conventions#728 is released
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, 'gen_ai.extract')?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  await expect
    .poll(() => fetchSpanAttributes(traceId, spanId!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [GEN_AI_OPERATION_NAME]: 'extract',
      [GEN_AI_REQUEST_MODEL]: '@cf/cloudflare/clairic',
      [GEN_AI_RESPONSE_MODEL]: expect.stringContaining('clairic'),
      [GEN_AI_INPUT_MESSAGES]: expect.stringContaining('Northwind Supply'),
      [GEN_AI_OUTPUT_MESSAGES]: expect.stringContaining('INV-2291'),
    });
});
