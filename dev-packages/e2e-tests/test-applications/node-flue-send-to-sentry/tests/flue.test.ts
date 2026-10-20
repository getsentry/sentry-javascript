import { expect, test } from '@playwright/test';
import { EVENT_POLLING_OPTIONS, fetchSpanAttributes } from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn, waitForConversationTrace } from './utils';

test('sends the request / invoke_agent / chat / execute_tool hierarchy of a Flue turn', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(baseURL!, newInstanceId('weather'), 'What is the weather in Paris?');

  const { traceId, spans } = await waitForConversationTrace(conversationId, spans =>
    ['http.server', 'gen_ai.invoke_agent', 'gen_ai.chat', 'gen_ai.execute_tool', 'http.client'].every(op =>
      spans.some(span => span.op === op),
    ),
  );

  const request = spans.find(span => span.op === 'http.server');
  const agents = spans.filter(span => span.op === 'gen_ai.invoke_agent');
  const invokeAgent = agents[0];
  const chat = spans.find(span => span.op === 'gen_ai.chat');
  const executeTool = spans.find(span => span.description === 'execute_tool get_weather');

  // A turn has one agent span. More than one means other conversations' runs leaked into this
  // trace (https://github.com/withastro/flue/issues/813).
  expect(agents).toHaveLength(1);
  // On Node the turn runs inside the request that admitted it, so the agent span hangs off the
  // request span instead of starting a trace of its own as it does on Cloudflare.
  expect(invokeAgent?.parent_span_id).toBe(request?.event_id);
  // Tool and chat spans are siblings under the agent invocation, matching how Flue's own
  // OpenTelemetry adapter projects them.
  expect(chat?.parent_span_id).toBe(invokeAgent?.event_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.event_id);
  // The provider's HTTP call is made while the chat span is active.
  expect(spans.some(span => span.op === 'http.client' && span.parent_span_id === chat?.event_id)).toBe(true);

  await expect
    .poll(() => fetchSpanAttributes(traceId, invokeAgent!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      origin: 'auto.ai.flue',
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.agent.name': 'Hello',
      'gen_ai.conversation.id': conversationId,
    });

  await expect
    .poll(() => fetchSpanAttributes(traceId, chat!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      origin: 'auto.ai.flue',
      'span.status': 'ok',
      'gen_ai.provider.name': 'openrouter',
      'gen_ai.usage.input_tokens': expect.anything(),
      'gen_ai.usage.output_tokens': expect.anything(),
      // Flue computes cost itself; no provider SDK reports it.
      'gen_ai.cost.total_tokens': expect.anything(),
    });

  await expect
    .poll(() => fetchSpanAttributes(traceId, executeTool!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ origin: 'auto.ai.flue', 'gen_ai.tool.name': 'get_weather' });
});

test('nests a manual span raised inside a tool under that tool span', async ({ baseURL }) => {
  const conversationId = await runAgentTurn(baseURL!, newInstanceId('manual-span'), 'What is the weather in Berlin?');

  const { traceId, spans } = await waitForConversationTrace(conversationId, spans =>
    spans.some(span => span.description === 'resolve-weather'),
  );

  const manualSpan = spans.find(span => span.description === 'resolve-weather');
  const parent = spans.find(span => span.event_id === manualSpan?.parent_span_id);
  expect(parent?.description).toBe('execute_tool get_weather');

  await expect
    .poll(() => fetchSpanAttributes(traceId, manualSpan!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ 'weather.source': 'static-table', 'weather.city': 'Berlin' });
});
