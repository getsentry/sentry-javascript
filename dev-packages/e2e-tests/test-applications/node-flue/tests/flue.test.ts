import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { newConversationId, runAgentTurn } from './utils';

const APP = 'node-flue';

type SpanLike = { name?: string; attributes?: Record<string, { value?: unknown }> };

const hasOps = (ops: string[]) => (spansOfTrace: SpanLike[]) =>
  ops.every(op => spansOfTrace.some(span => getSpanOp(span) === op));

// Anchored on the tool the test drives, so a leftover trace from another test cannot satisfy it.
const usedTool = (toolName: string) => (spansOfTrace: SpanLike[]) =>
  spansOfTrace.some(span => span.attributes?.['gen_ai.tool.name']?.value === toolName);

test('captures the invoke_agent / chat / execute_tool hierarchy for a Flue turn', async ({ baseURL }) => {
  // The trace flushes across several envelopes, so accumulate it rather than asserting on one.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      hasOps(['gen_ai.invoke_agent', 'gen_ai.chat', 'gen_ai.execute_tool'])(spansOfTrace) &&
      usedTool('get_weather')(spansOfTrace),
  );

  await runAgentTurn(baseURL!, newConversationId('weather'), 'What is the weather in Paris?');

  const spans = await spansPromise;
  const invokeAgent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const chat = spans.find(span => getSpanOp(span) === 'gen_ai.chat');
  const executeTool = spans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

  expect(invokeAgent?.attributes?.['sentry.origin']?.value).toBe('auto.ai.flue');
  expect(invokeAgent?.attributes?.['gen_ai.operation.name']?.value).toBe('invoke_agent');
  expect(invokeAgent?.attributes?.['gen_ai.agent.name']?.value).toBe('Hello');

  expect(chat?.attributes?.['sentry.origin']?.value).toBe('auto.ai.flue');
  expect(chat?.attributes?.['gen_ai.provider.name']?.value).toBe('openrouter');
  expect(typeof chat?.attributes?.['gen_ai.usage.input_tokens']?.value).toBe('number');
  expect(typeof chat?.attributes?.['gen_ai.usage.output_tokens']?.value).toBe('number');
  // Flue computes cost itself; no provider SDK reports it.
  expect(typeof chat?.attributes?.['gen_ai.cost.total_tokens']?.value).toBe('number');

  expect(executeTool?.attributes?.['gen_ai.tool.name']?.value).toBe('get_weather');

  // Tool and chat spans are siblings under the agent invocation, matching how Flue's own
  // OpenTelemetry adapter projects them.
  expect(chat?.parent_span_id).toBe(invokeAgent?.span_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.span_id);
});

// Two turns: if the context leaked, the second would land in the first request's trace (withastro/flue#813).
test('puts each turn under the request that sent it', async ({ baseURL }) => {
  for (const prefix of ['first-request', 'second-request']) {
    const conversationId = newConversationId(prefix);
    const isRequest = (span: SpanLike & { is_segment?: boolean }) =>
      span.is_segment === true &&
      span.name?.startsWith('POST') &&
      Object.values(span.attributes ?? {}).some(
        attribute => typeof attribute?.value === 'string' && attribute.value.includes(conversationId),
      );
    const spansPromise = collectStreamedSpans(
      APP,
      spansOfTrace => spansOfTrace.some(isRequest) && hasOps(['gen_ai.invoke_agent'])(spansOfTrace),
    );

    await runAgentTurn(baseURL!, conversationId, 'Say hello.');

    const spans = await spansPromise;
    const request = spans.find(isRequest);
    const agents = spans.filter(span => getSpanOp(span) === 'gen_ai.invoke_agent');
    expect(agents).toHaveLength(1);
    expect(agents[0]?.parent_span_id).toBe(request?.span_id);
  }
});

test('nests a manual span raised inside a tool under that tool span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => usedTool('get_weather')(spansOfTrace) && spansOfTrace.some(span => span.name === 'resolve-weather'),
  );

  await runAgentTurn(baseURL!, newConversationId('manual-span'), 'What is the weather in Berlin?');

  const spans = await spansPromise;
  const executeTool = spans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');
  const manualSpan = spans.find(span => span.name === 'resolve-weather');

  expect(manualSpan?.attributes?.['weather.source']?.value).toBe('static-table');
  // The model chooses the argument (`Berlin`, `Berlin, Germany`, ...).
  expect(manualSpan?.attributes?.['weather.city']?.value).toEqual(expect.stringContaining('Berlin'));
  expect(manualSpan?.trace_id).toBe(executeTool?.trace_id);
  expect(manualSpan?.parent_span_id).toBe(executeTool?.span_id);
});

// Flue's `model` operation is wrapped so the turn span is active for it, which is what puts the
// provider's HTTP call inside `chat` rather than beside it.
test('nests the provider HTTP call inside the chat span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.chat') &&
      spansOfTrace.some(span => getSpanOp(span) === 'http.client'),
  );

  await runAgentTurn(baseURL!, newConversationId('provider-http'), 'Say hello.');

  const spans = await spansPromise;
  const chat = spans.find(span => getSpanOp(span) === 'gen_ai.chat');
  const providerCall = spans.find(span => getSpanOp(span) === 'http.client');

  expect(providerCall?.trace_id).toBe(chat?.trace_id);
  expect(providerCall?.parent_span_id).toBe(chat?.span_id);
});
