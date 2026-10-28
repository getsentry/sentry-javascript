import { expect, test } from '@playwright/test';
import { SEARCH_ORIGIN } from '@sentry/conventions/attributes/search';
import { CACHE_GET } from '@sentry/conventions/op';
import { EVENT_POLLING_OPTIONS, fetchSpanAttributes } from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn, waitForConversationTrace } from './utils';

// Orchestrion only hooks `dataloader` with the loader preloaded (`--import` in the start script).
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
