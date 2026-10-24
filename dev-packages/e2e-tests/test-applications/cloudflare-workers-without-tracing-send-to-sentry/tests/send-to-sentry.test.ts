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
  let cloudflareSpan: WorkersLogsEvent['$metadata'] | undefined;
  await expect
    .poll(
      async () =>
        (cloudflareSpan = (await fetchWorkersLogsEvents({ '$metadata.rayId': rayId, '$metadata.type': 'span' }))[0]
          ?.$metadata),
      EVENT_POLLING_OPTIONS,
    )
    .toMatchObject({ traceId: expect.any(String), spanId: expect.any(String) });

  console.log(`Polling for error eventId ${eventId}: sentry trace view ${traceTarget(cloudflareSpan!.traceId!)}`);

  let event: ApiEvent | undefined;
  await expect.poll(() => (event = fetchEvent(eventId)), EVENT_POLLING_OPTIONS).toBeDefined();

  expect(event?.contexts?.trace).toMatchObject({
    trace_id: cloudflareSpan?.traceId,
    parent_span_id: cloudflareSpan?.spanId,
  });
});
