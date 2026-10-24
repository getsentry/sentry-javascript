import { expect, test } from '@playwright/test';
import {
  SEARCH_GEN_AI__AGENT__NAME,
  SEARCH_GEN_AI__CONVERSATION__ID,
  SEARCH_GEN_AI__COST__TOTAL_TOKENS,
  SEARCH_GEN_AI__INPUT__MESSAGES,
  SEARCH_GEN_AI__OPERATION__NAME,
  SEARCH_GEN_AI__PROVIDER__NAME,
  SEARCH_GEN_AI__TOOL__CALL__ARGUMENTS,
  SEARCH_GEN_AI__TOOL__CALL__RESULT,
  SEARCH_GEN_AI__TOOL__NAME,
  SEARCH_GEN_AI__USAGE__INPUT_TOKENS,
  SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS,
  SEARCH_ORIGIN,
  SEARCH_SPAN__STATUS,
} from '@sentry/conventions/attributes/search';
import {
  GEN_AI_CHAT,
  GEN_AI_EXECUTE_TOOL,
  GEN_AI_INVOKE_AGENT,
  HTTP_CLIENT,
  HTTP_SERVER,
} from '@sentry/conventions/op';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import { EVENT_POLLING_OPTIONS, fetchSpanAttributes } from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn, waitForConversationTrace } from './utils';

test('sends the request / invoke_agent / chat / execute_tool hierarchy of a Flue turn', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(baseURL!, newInstanceId('weather'), 'What is the weather in Paris?');

  // Spans land at different times, so wait for the relationships checked below, not just the ops.
  const isProviderCall = (span: TraceItem, spans: TraceItem[]) =>
    span.op === HTTP_CLIENT && spans.some(chat => chat.op === GEN_AI_CHAT && chat.event_id === span.parent_span_id);
  const { traceId, spans } = await waitForConversationTrace(
    conversationId,
    spans =>
      [HTTP_SERVER, GEN_AI_INVOKE_AGENT, GEN_AI_EXECUTE_TOOL].every(op => spans.some(span => span.op === op)) &&
      spans.some(span => isProviderCall(span, spans)),
  );

  const request = spans.find(span => span.op === HTTP_SERVER);
  const agents = spans.filter(span => span.op === GEN_AI_INVOKE_AGENT);
  const invokeAgent = agents[0];
  const chats = spans.filter(span => span.op === GEN_AI_CHAT);
  const executeTool = spans.find(span => span.description === 'execute_tool get_weather');

  // More than one means other conversations leaked into this trace (withastro/flue#813).
  expect(agents).toHaveLength(1);
  expect(invokeAgent?.parent_span_id).toBe(request?.event_id);
  // A chat span anywhere else would be a provider SDK reporting the same call a second time.
  expect(chats.map(chat => chat.parent_span_id)).toEqual(chats.map(() => invokeAgent?.event_id));
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.event_id);

  await expect
    .poll(() => fetchSpanAttributes(traceId, invokeAgent!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [SEARCH_ORIGIN]: 'auto.ai.flue',
      [SEARCH_GEN_AI__OPERATION__NAME]: 'invoke_agent',
      [SEARCH_GEN_AI__AGENT__NAME]: 'Hello',
      [SEARCH_GEN_AI__CONVERSATION__ID]: conversationId,
    });

  let chatAttributes: Record<string, unknown> | undefined;
  await expect
    .poll(() => (chatAttributes = fetchSpanAttributes(traceId, chats[0]!.event_id!)), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [SEARCH_ORIGIN]: 'auto.ai.flue',
      [SEARCH_SPAN__STATUS]: 'ok',
      [SEARCH_GEN_AI__PROVIDER__NAME]: 'openrouter',
      [SEARCH_GEN_AI__INPUT__MESSAGES]: expect.stringContaining('What is the weather in Paris?'),
    });
  // The trace-items API returns integer attributes as strings.
  expect(Number(chatAttributes![SEARCH_GEN_AI__USAGE__INPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(chatAttributes![SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS])).toBeGreaterThan(0);
  // Flue computes cost itself; no provider SDK reports it.
  expect(chatAttributes![SEARCH_GEN_AI__COST__TOTAL_TOKENS]).toBeGreaterThan(0);

  await expect
    .poll(() => fetchSpanAttributes(traceId, executeTool!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      [SEARCH_ORIGIN]: 'auto.ai.flue',
      [SEARCH_GEN_AI__TOOL__NAME]: 'get_weather',
      // The model picks the argument (`Paris`, `Paris, France`, ...).
      [SEARCH_GEN_AI__TOOL__CALL__ARGUMENTS]: expect.stringContaining('Paris'),
      [SEARCH_GEN_AI__TOOL__CALL__RESULT]: expect.stringMatching(/^It is 21 degrees and sunny in Paris/),
    });
});

test('nests a manual span raised inside a tool under that tool span', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(baseURL!, newInstanceId('manual-span'), 'What is the weather in Berlin?');

  const { traceId, spans } = await waitForConversationTrace(conversationId, spans =>
    spans.some(
      span => span.description === 'resolve-weather' && spans.some(parent => parent.event_id === span.parent_span_id),
    ),
  );

  const manualSpan = spans.find(span => span.description === 'resolve-weather');
  const parent = spans.find(span => span.event_id === manualSpan?.parent_span_id);
  expect(parent?.description).toBe('execute_tool get_weather');

  await expect
    .poll(() => fetchSpanAttributes(traceId, manualSpan!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ 'weather.source': 'static-table', 'weather.city': expect.stringContaining('Berlin') });
});
