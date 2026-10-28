import { expect, test } from '@playwright/test';
import { SEARCH_GEN_AI__TOOL__NAME, SEARCH_SPAN__STATUS } from '@sentry/conventions/attributes/search';
import {
  EVENT_POLLING_OPTIONS,
  fetchEvent,
  fetchSpanAttributes,
  findErrorInTrace,
} from '@sentry-internal/test-utils/cli';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn, waitForConversationTrace } from './utils';

test('sends an error thrown inside a Flue tool and marks its span errored', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(
    baseURL!,
    newInstanceId('failure'),
    'Please call fail_now to trigger a failure.',
  );

  const { traceId, spans } = await waitForConversationTrace(conversationId, spans =>
    spans.some(span => span.description === 'execute_tool fail_now'),
  );

  let error: TraceItem | undefined;
  await expect.poll(() => (error = findErrorInTrace(traceId)), EVENT_POLLING_OPTIONS).toBeDefined();
  await expect
    .poll(
      () => fetchEvent(error!.event_id!)?.entries.find(entry => entry.type === 'exception')?.data.values?.[0],
      EVENT_POLLING_OPTIONS,
    )
    .toMatchObject({ value: 'Intentional flue tool failure', mechanism: { type: 'auto.ai.flue' } });

  const executeTool = spans.find(span => span.description === 'execute_tool fail_now');
  await expect
    .poll(() => fetchSpanAttributes(traceId, executeTool!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ [SEARCH_GEN_AI__TOOL__NAME]: 'fail_now', [SEARCH_SPAN__STATUS]: 'error' });
});
