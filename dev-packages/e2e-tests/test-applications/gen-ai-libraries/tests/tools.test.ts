import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { attr, describeTree, hasRecordedToolCalls, isExecuteToolSpan, isModelCallSpan, LIBRARIES } from './utils';

// The direct-SDK libraries record the model's tool call on the chat span's `gen_ai.response.tool_calls`
// attribute, which only exists when the model actually returned tool calls.
const DIRECT_SDK_LIBRARIES = LIBRARIES.filter(library => !library.executesTools);

for (const library of DIRECT_SDK_LIBRARIES) {
  test(`${library.id}: the model's tool call is recorded on the ${library.op} span`, async ({ baseURL }) => {
    // Scope to this tools request's trace: this library's model-call span, carrying recorded tool calls.
    const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
      spansOfTrace.some(span => isModelCallSpan(span, library) && hasRecordedToolCalls(span)),
    );

    const response = await fetch(`${baseURL}/${library.id}/tools`);
    expect(response.status).toBe(200);

    const spans = await spansPromise;
    const modelSpan = spans.find(span => isModelCallSpan(span, library) && hasRecordedToolCalls(span));

    expect(
      modelSpan,
      `expected a ${library.op} span with recorded tool calls in:\n${describeTree(spans)}`,
    ).toBeDefined();
    expect(attr(modelSpan!, 'gen_ai.response.tool_calls')).toContain('get_weather');
  });
}

// The libraries that run an agent loop execute the tool and emit a dedicated `gen_ai.execute_tool` span.
for (const library of LIBRARIES.filter(library => library.executesTools)) {
  test(`${library.id}: the tool call is captured as a gen_ai.execute_tool span`, async ({ baseURL }) => {
    const spansPromise = collectStreamedSpans(
      APP,
      spansOfTrace => spansOfTrace.some(isExecuteToolSpan) && spansOfTrace.some(span => isModelCallSpan(span, library)),
    );

    const response = await fetch(`${baseURL}/${library.id}/tools`);
    expect(response.status).toBe(200);

    const spans = await spansPromise;
    const toolSpan = spans.find(isExecuteToolSpan);

    expect(toolSpan, `expected a gen_ai.execute_tool span in:\n${describeTree(spans)}`).toBeDefined();
    expect(attr(toolSpan!, 'gen_ai.tool.name')).toBe('get_weather');
  });
}

// A real provider request goes over HTTP, which a fake adapter cannot show. TanStack AI wraps that fetch
// so the request nests under the `chat` span of its model call.
test('tanstack-ai: the agent loop nests its model calls, tool call and provider requests', async ({ baseURL }) => {
  const library = LIBRARIES.find(library => library.id === 'tanstack-ai')!;
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(isExecuteToolSpan) &&
      spansOfTrace.filter(span => isModelCallSpan(span, library)).length >= 2 &&
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.invoke_agent'),
  );

  const response = await fetch(`${baseURL}/tanstack-ai/tools`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const tree = describeTree(spans);
  const agent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const chats = spans.filter(span => isModelCallSpan(span, library));
  const toolSpan = spans.find(isExecuteToolSpan);

  expect(agent, tree).toBeDefined();
  expect(attr(agent!, 'gen_ai.provider.name')).toBe('openrouter');
  expect(chats, tree).toHaveLength(2);
  expect(
    chats.every(span => span.parent_span_id === agent!.span_id),
    tree,
  ).toBe(true);
  expect(toolSpan!.parent_span_id, tree).toBe(agent!.span_id);

  // The first call returns the tool call, the second answers with the tool result.
  const [first, second] = [...chats].sort((a, b) => a.start_timestamp - b.start_timestamp);
  expect(attr(first!, 'gen_ai.response.finish_reasons')).toBe('["tool_calls"]');
  expect(attr(first!, 'gen_ai.output.messages')).toContain('get_weather');
  expect(attr(second!, 'gen_ai.response.finish_reasons')).toBe('["stop"]');
  expect(typeof attr(second!, 'gen_ai.response.id')).toBe('string');

  // The agent span sums the usage of both model calls. OpenRouter reports the cost itself, also for a BYOK
  // key, where its own fee is 0.
  expect(attr(agent!, 'gen_ai.usage.input_tokens')).toBe(
    (attr(first!, 'gen_ai.usage.input_tokens') as number) + (attr(second!, 'gen_ai.usage.input_tokens') as number),
  );
  expect(attr(agent!, 'gen_ai.cost.total_tokens')).toBeGreaterThan(0);

  const providerRequests = spans.filter(
    span =>
      getSpanOp(span) === 'http.client' && String(attr(span, 'server.address') ?? span.name).includes('openrouter'),
  );
  expect(providerRequests, tree).toHaveLength(2);
  expect(
    providerRequests.every(span => chats.some(chat => chat.span_id === span.parent_span_id)),
    tree,
  ).toBe(true);
});
