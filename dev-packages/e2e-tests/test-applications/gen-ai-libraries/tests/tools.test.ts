import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { attr, describeTree, hasRecordedToolCalls, isExecuteToolSpan, isModelCallSpan, LIBRARIES } from './utils';

// The direct-SDK libraries record the model's tool call on the chat span's `gen_ai.response.tool_calls`
// attribute, which only exists when the model actually returned tool calls.
const DIRECT_SDK_LIBRARIES = LIBRARIES.filter(library => library.provider);

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

// The Vercel AI SDK executes the tool and emits a dedicated `gen_ai.execute_tool` span instead.
test('vercel-ai: the tool call is captured as a gen_ai.execute_tool span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(isExecuteToolSpan) && spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.generate_content'),
  );

  const response = await fetch(`${baseURL}/vercel-ai/tools`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const toolSpan = spans.find(isExecuteToolSpan);

  expect(toolSpan, `expected a gen_ai.execute_tool span in:\n${describeTree(spans)}`).toBeDefined();
  expect(attr(toolSpan!, 'gen_ai.tool.name')).toBe('get_weather');
});
