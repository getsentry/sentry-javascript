import { expect, test } from '@playwright/test';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findTraceIdOfSpan,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn } from './utils';

// Set by global-setup.ts once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL!;

/**
 * On Cloudflare orchestrion runs at build time (`@sentry/cloudflare/vite` injects the channels),
 * so unlike the Node app there is no `--import` bootstrap and no variant: the span is either there
 * or the build-time instrumentation regressed.
 */
test('captures orchestrion-instrumented dataloader spans in the same trace as the AI spans', async () => {
  const conversationId = await runAgentTurn(
    workerUrl,
    newInstanceId('dataloader'),
    'Please call count_items to count the items.',
  );

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the dataloader span: sentry trace view ${traceTarget(traceId!)}`);

  let spans: TraceItem[] = [];
  await expect
    .poll(() => (spans = flattenTrace(fetchTrace(traceId!))).map(span => span.op), EVENT_POLLING_OPTIONS)
    .toEqual(expect.arrayContaining(['gen_ai.execute_tool', 'cache.get']));

  const dataloaderSpan = spans.find(span => span.op === 'cache.get');
  const toolSpan = spans.find(span => span.description === 'execute_tool count_items');

  await expect
    .poll(() => fetchSpanAttributes(traceId!, dataloaderSpan!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ origin: 'auto.db.dataloader' });
  expect(toolSpan).toBeDefined();
});
