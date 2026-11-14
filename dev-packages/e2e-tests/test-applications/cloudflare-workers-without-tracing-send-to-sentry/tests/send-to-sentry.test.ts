import { expect, test } from '@playwright/test';
import { EVENT_POLLING_OPTIONS, fetchEvent, traceTarget } from '@sentry-internal/test-utils/cli';
import type { ApiEvent } from '@sentry-internal/test-utils/cli';
import { fetchFromWorker, fetchWorkersLogsEvents } from '@sentry-internal/test-utils/cloudflare';
import type { WorkersLogsEvent } from '@sentry-internal/test-utils/cloudflare';

// Set by global-setup.ts once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL;

test('Sends an error in the Cloudflare trace to Sentry', async () => {
  const { eventId, rayId }: { eventId: string; rayId: string } = JSON.parse(
    await fetchFromWorker(`${workerUrl}/test-error`, 200),
  );

  // The span of the request is the root span of the Cloudflare trace, and the only span with the `cf-ray` of the
  // request.
  let cloudflareSpans: WorkersLogsEvent[] = [];
  await expect
    .poll(
      async () =>
        (cloudflareSpans = await fetchWorkersLogsEvents({ '$metadata.rayId': rayId, '$metadata.type': 'span' })),
      EVENT_POLLING_OPTIONS,
    )
    .toHaveLength(1);
  const { traceId, spanId } = cloudflareSpans[0]!.$metadata;
  expect(traceId).toEqual(expect.stringMatching(/^[\da-f]{32}$/));
  expect(spanId).toEqual(expect.stringMatching(/^[\da-f]{16}$/));

  console.log(`Polling for error eventId ${eventId}: sentry trace view ${traceTarget(traceId!)}`);

  let event: ApiEvent | undefined;
  await expect.poll(() => (event = fetchEvent(eventId)), EVENT_POLLING_OPTIONS).toBeDefined();

  expect(event?.contexts?.trace?.trace_id).toBe(traceId);
  expect(event?.contexts?.trace?.parent_span_id).toBe(spanId);
});
