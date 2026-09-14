import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan, waitForError } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

const MASTRA_ORIGIN = 'auto.ai.mastra';
const isOp =
  (op: string) =>
  (span: SerializedStreamedSpan): boolean =>
    getSpanOp(span) === op;
const isGenAiSpan = (span: SerializedStreamedSpan): boolean => String(getSpanOp(span) ?? '').startsWith('gen_ai.');
const describeSpan = (span: SerializedStreamedSpan): { op: string | undefined; name?: string; origin: unknown } => ({
  op: getSpanOp(span),
  name: span.name,
  origin: attrValue(span, 'sentry.origin'),
});
// All tests share one app + proxy, so we scope each to its own trace by the unique
// tool it triggers — otherwise a test could match another test's agent-run trace
// (they all share the same gen_ai ops).
const callsTool =
  (toolName: string) =>
  (span: SerializedStreamedSpan): boolean =>
    isOp('gen_ai.execute_tool')(span) && attrValue(span, 'gen_ai.tool.name') === toolName;

test('captures Mastra agent spans (invoke_agent, chat, execute_tool) with inputs/outputs and conversation id', async ({
  baseURL,
}) => {
  const thread = `e2e-thread-${Date.now()}`;

  // Accumulate this turn's trace — identified by its `get_weather` tool call —
  // across envelopes until the agent/model spans have also arrived. Tool spans are
  // matched by op alone (not origin), so a double-instrumented span is collected
  // too and caught by the assertions below.
  const isGenerateServerSpan = (span: SerializedStreamedSpan): boolean =>
    isOp('http.server')(span) && String(attrValue(span, 'url.full') ?? '').includes('/api/agents/');

  const traceSpansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(callsTool('get_weather')) &&
      ['gen_ai.invoke_agent', 'gen_ai.chat'].every(op => spansOfTrace.some(isOp(op))) &&
      // The root `http.server` span ends (and streams) after its children, so wait for it too.
      spansOfTrace.some(isGenerateServerSpan),
  );

  await runAgentTurn(baseURL!, 'What is the weather in Paris?', { thread, resource: 'e2e-user' });

  const traceSpans = await traceSpansPromise;

  // No double instrumentation. Mastra drives the Vercel AI SDK internally, so
  // Sentry's vercel-ai integration could also emit spans for the same calls. The
  // Mastra integration must be the only source of AI spans: every gen_ai span is
  // `auto.ai.mastra`, and there must be no vercel-ai spans in the trace at all.
  expect(
    traceSpans
      .filter(span => isGenAiSpan(span) && attrValue(span, 'sentry.origin') !== MASTRA_ORIGIN)
      .map(describeSpan),
  ).toEqual([]);
  expect(
    traceSpans
      .filter(span => String(attrValue(span, 'sentry.origin') ?? '').startsWith('auto.vercelai'))
      .map(describeSpan),
  ).toEqual([]);

  const invokeAgent = traceSpans.find(isOp('gen_ai.invoke_agent'));
  const chat = traceSpans.find(isOp('gen_ai.chat'));
  const executeTool = traceSpans.find(callsTool('get_weather'));

  // Agent span.
  expect(attrValue(invokeAgent!, 'gen_ai.operation.name')).toBe('invoke_agent');
  expect(attrValue(invokeAgent!, 'gen_ai.agent.name')).toBe('weatherAgent');

  // Model span. The request model is the id passed to `openrouter(...)`; the
  // provider string is asserted loosely because it depends on the AI SDK
  // provider, not on Sentry.
  expect(attrValue(chat!, 'gen_ai.operation.name')).toBe('chat');
  expect(String(attrValue(chat!, 'gen_ai.request.model') ?? '')).toContain('gpt-4o-mini');
  expect(attrValue(chat!, 'gen_ai.provider.name')).toBeTruthy();
  expect(typeof attrValue(chat!, 'gen_ai.usage.input_tokens')).toBe('number');
  expect(typeof attrValue(chat!, 'gen_ai.usage.output_tokens')).toBe('number');
  expect(typeof attrValue(chat!, 'gen_ai.usage.total_tokens')).toBe('number');

  // Tool span.
  expect(attrValue(executeTool!, 'gen_ai.operation.name')).toBe('execute_tool');
  expect(attrValue(executeTool!, 'gen_ai.tool.name')).toBe('get_weather');

  // Inputs and outputs (recorded with the SDK's default data collection).
  expect(String(attrValue(invokeAgent!, 'gen_ai.input.messages') ?? '')).toContain('Paris');
  expect(String(attrValue(invokeAgent!, 'gen_ai.output.messages') ?? '')).not.toBe('');
  expect(String(attrValue(executeTool!, 'gen_ai.tool.call.arguments') ?? '')).toContain('Paris');
  // Both the tool arguments and the tool result are captured. The exporter maps
  // Mastra's tool `output` to `gen_ai.tool.call.result`; here the tool returns
  // `{ city, condition: 'Sunny', temperatureC: 22 }`.
  expect(String(attrValue(executeTool!, 'gen_ai.tool.call.result') ?? '')).toContain('Sunny');

  // Conversation id: the exporter maps Mastra's `metadata.threadId` to
  // `gen_ai.conversation.id` on every mapped span.
  expect(attrValue(invokeAgent!, 'gen_ai.conversation.id')).toBe(thread);
  expect(attrValue(chat!, 'gen_ai.conversation.id')).toBe(thread);
  expect(attrValue(executeTool!, 'gen_ai.conversation.id')).toBe(thread);

  // http.server span: Mastra serves the agent through its internal Hono server, so the incoming
  // `POST /api/agents/weatherAgent/generate` request is the root `http.server` span of this trace,
  // and the AI spans above are its children.
  const serverSpan = traceSpans.find(isGenerateServerSpan);
  expect(serverSpan).toBeDefined();
  expect(getSpanOp(serverSpan!)).toBe('http.server');
  expect(attrValue(serverSpan!, 'http.request.method')).toBe('POST');
  expect(attrValue(serverSpan!, 'http.response.status_code')).toBe(200);
  expect(String(attrValue(serverSpan!, 'url.full') ?? '')).toContain('/api/agents/weatherAgent/generate');
  expect(attrValue(serverSpan!, 'sentry.segment.name.source')).toBe('route');
  expect(attrValue(serverSpan!, 'http.route')).toMatch(/^\/api\/agents\/:[^/]+\/generate$/);
  expect(serverSpan!.name).toMatch(/^POST \/api\/agents\/:[^/]+\/generate$/);
});

test('captures a Mastra tool error as an issue and marks the tool span', async ({ baseURL }) => {
  // A thrown tool error surfaces both ways: reflected on the exporter's tool span (error status +
  // `error.type`) and captured as a Sentry issue with the real error and stack, from the Mastra
  // integration (mechanism `auto.ai.mastra`). `fail_now` is unique to this test, so both the errored
  // tool span and the captured error isolate this turn.
  const erroredToolSpanPromise = collectStreamedSpans(APP, spansOfTrace =>
    spansOfTrace.some(span => callsTool('fail_now')(span) && Boolean(attrValue(span, 'error.type'))),
  );
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Intentional Mastra tool failure',
  );

  await runAgentTurn(baseURL!, 'Please call the tool that triggers a failure now.');

  const spans = await erroredToolSpanPromise;
  const erroredTool = spans.find(span => callsTool('fail_now')(span) && Boolean(attrValue(span, 'error.type')));

  // The errored tool span comes from the Mastra exporter (no double instrumentation).
  expect(attrValue(erroredTool!, 'sentry.origin')).toBe(MASTRA_ORIGIN);
  expect(attrValue(erroredTool!, 'gen_ai.tool.name')).toBe('fail_now');
  expect(attrValue(erroredTool!, 'error.type')).toBeTruthy();
  expect(erroredTool!.status).not.toBe('ok');

  // The thrown error is captured as a proper issue with a real stack.
  const error = await errorPromise;
  const exception = error.exception?.values?.[0];
  expect(exception?.value).toBe('Intentional Mastra tool failure');
  expect(exception?.mechanism?.type).toBe('auto.ai.mastra');
  expect(exception?.mechanism?.handled).toBe(true);
  expect((exception?.stacktrace?.frames ?? []).length).toBeGreaterThan(0);
});
