import { expect, test } from '@playwright/test';
import { SEARCH_ORIGIN } from '@sentry/conventions/attributes/search';
import { CACHE_GET } from '@sentry/conventions/op';
import { EVENT_POLLING_OPTIONS, fetchSpanAttributes } from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn, waitForConversationTrace } from './utils';

/**
 * `dataloader` is instrumented through orchestrion, a module transform, so it only produces spans
 * with the loader registered at process start (`--import=@sentry/node/import` in the start script).
 * The loader is called from inside a tool so its span lands in the agent's trace, beside the AI spans.
 */
test('sends orchestrion-instrumented dataloader spans in the same trace as the AI spans', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(
    baseURL!,
    newInstanceId('dataloader'),
    'Please call count_items to count the items.',
  );

  const { traceId, spans } = await waitForConversationTrace(
    conversationId,
    spans =>
      spans.some(span => span.description === 'execute_tool count_items') && spans.some(span => span.op === CACHE_GET),
  );

  const dataloaderSpan = spans.find(span => span.op === CACHE_GET);
  await expect
    .poll(() => fetchSpanAttributes(traceId, dataloaderSpan!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ [SEARCH_ORIGIN]: 'auto.db.dataloader' });
});
