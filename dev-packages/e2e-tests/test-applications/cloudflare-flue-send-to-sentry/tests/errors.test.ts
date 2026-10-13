import { expect, test } from '@playwright/test';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import {
  EVENT_POLLING_OPTIONS,
  fetchEvent,
  fetchSpanAttributes,
  fetchTrace,
  findErrorInTrace,
  findTraceIdOfSpan,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn } from './utils';

// Set by global-setup.ts once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL!;

test('captures an error thrown inside a Flue tool and marks its span errored', async () => {
  const conversationId = await runAgentTurn(
    workerUrl,
    newInstanceId('failure'),
    'Please call fail_now to trigger a failure.',
  );

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the tool error: sentry trace view ${traceTarget(traceId!)}`);

  let error: TraceItem | undefined;
  await expect.poll(() => (error = findErrorInTrace(traceId!)), EVENT_POLLING_OPTIONS).toBeDefined();
  await expect
    .poll(
      () =>
        fetchEvent(error!.event_id!)?.entries.find(entry => entry.type === 'exception')?.data.values?.[0]?.mechanism
          ?.type,
      EVENT_POLLING_OPTIONS,
    )
    .toBe('auto.ai.flue');

  let spans: TraceItem[] = [];
  await expect
    .poll(() => (spans = flattenTrace(fetchTrace(traceId!))).map(span => span.description), EVENT_POLLING_OPTIONS)
    .toContain('execute_tool fail_now');

  const executeTool = spans.find(span => span.description === 'execute_tool fail_now');
  await expect
    .poll(() => fetchSpanAttributes(traceId!, executeTool!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ 'gen_ai.tool.name': 'fail_now', 'span.status': 'error' });
});
