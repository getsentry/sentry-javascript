import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { attr, isTurnOf, newAgentId, runAgentTurn, type StreamedSpan } from './utils';

const APP = 'cloudflare-think';

/**
 * The whole point of the app: nothing wires Sentry into Think by hand. `sentryCloudflareVitePlugin()`
 * detects `class ThinkAgent extends Think` and wraps the export at build time, and the `ai` SDK publishes
 * the telemetry `vercelAIIntegration` consumes. The worker's only Sentry import is the `startSpan` the
 * manual-span test below needs. Nothing here is Think-specific on the SDK side, so this test is what
 * would catch either half of that chain breaking.
 *
 * `collectStreamedSpans` rather than `waitForStreamedSpans`: the streamed `invoke_agent` parent stays
 * open until its children settle and flushes in a separate envelope from them, so a single envelope
 * never holds the whole turn.
 */
test('captures the invoke_agent / generate_content / execute_tool hierarchy for a Think turn', async ({ baseURL }) => {
  const agentId = newAgentId('hierarchy');
  const ofThisTurn = isTurnOf(agentId);

  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ofThisTurn(spansOfTrace as StreamedSpan[]) &&
      ['gen_ai.invoke_agent', 'gen_ai.generate_content', 'gen_ai.execute_tool'].every(op =>
        spansOfTrace.some(span => getSpanOp(span) === op),
      ),
  );

  await runAgentTurn(baseURL!, agentId, 'What is the weather in Paris?');

  const spans = (await spansPromise) as StreamedSpan[];

  const invokeAgent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const generateContent = spans.find(span => getSpanOp(span) === 'gen_ai.generate_content');
  const executeTool = spans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

  expect(attr(invokeAgent, 'sentry.origin')).toBe('auto.vercelai.channel');
  expect(attr(invokeAgent, 'gen_ai.operation.name')).toBe('invoke_agent');
  // Think passes `this.constructor.name` to the AI SDK as the `functionId`, so this only holds while
  // the build-time wrapper leaves the user's class name alone (#24700).
  expect(invokeAgent?.name).toBe('invoke_agent ThinkAgent');
  expect(attr(invokeAgent, 'gen_ai.function_id')).toBe('ThinkAgent');
  expect(attr(invokeAgent, 'gen_ai.provider.name')).toBe('openrouter');
  expect(typeof attr(invokeAgent, 'gen_ai.usage.input_tokens')).toBe('number');
  expect(typeof attr(invokeAgent, 'gen_ai.usage.output_tokens')).toBe('number');
  expect(typeof attr(invokeAgent, 'gen_ai.usage.total_tokens')).toBe('number');

  expect(attr(generateContent, 'gen_ai.operation.name')).toBe('generate_content');
  expect(attr(generateContent, 'gen_ai.request.model')).toBe('openai/gpt-4o-mini');

  expect(attr(executeTool, 'gen_ai.operation.name')).toBe('execute_tool');
  expect(attr(executeTool, 'gen_ai.tool.name')).toBe('get_weather');

  // Inputs and outputs are recorded under the SDK's default data collection (the app sets no
  // `dataCollection` override).
  expect(String(attr(invokeAgent, 'gen_ai.input.messages') ?? '')).toContain('Paris');
  expect(String(attr(executeTool, 'gen_ai.tool.call.arguments') ?? '')).toContain('Paris');
  expect(String(attr(executeTool, 'gen_ai.tool.call.result') ?? '')).toContain('Sunny');

  // Think drives one `streamText` per turn with the step loop inside it, so the model calls are
  // children of the single agent span rather than siblings of it.
  expect(generateContent?.parent_span_id).toBe(invokeAgent?.span_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.span_id);
});

/**
 * A span the user starts inside a tool has to nest under that tool's span, which only holds if Think
 * runs tool execution inside the async context the SDK opened. Nothing in the SDK arranges this for
 * Think specifically, so it is worth pinning.
 */
test('nests a manual span raised inside a tool under that tool span', async ({ baseURL }) => {
  const agentId = newAgentId('manual-span');
  const ofThisTurn = isTurnOf(agentId);

  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ofThisTurn(spansOfTrace as StreamedSpan[]) &&
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.execute_tool') &&
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.tool.manual'),
  );

  await runAgentTurn(baseURL!, agentId, 'What is the weather in Paris?');

  const spans = (await spansPromise) as StreamedSpan[];
  const manualSpan = spans.find(span => getSpanOp(span) === 'gen_ai.tool.manual');
  const toolSpan = spans.find(span => span.span_id === manualSpan?.parent_span_id);

  expect(manualSpan?.name).toBe('lookup-forecast');
  expect(getSpanOp(toolSpan!)).toBe('gen_ai.execute_tool');
  expect(attr(toolSpan, 'gen_ai.tool.name')).toBe('get_weather');
});

/**
 * The request to the model provider must join the turn's trace rather than run beside it. A mocked
 * model cannot show this, which is why the app calls OpenRouter for real.
 *
 * Where it lands differs by `ai` major, and the difference is ours rather than the framework's. On
 * v7 the native `ai:telemetry` channel binds the model-call span into async context, so the fetch it
 * wraps nests under `gen_ai.generate_content`. On v4-v6 the model span comes from the orchestrion
 * `resolveLanguageModel` patch, which never makes that span active, so the fetch attaches to the
 * agent span instead and lands as the model call's sibling. Both keep the request in the turn, which
 * is what this asserts for every lane; the tighter parent is asserted only where it holds, so the
 * v6 shape is recorded rather than papered over.
 */
test('keeps the provider HTTP call inside the turn, under the model call on ai >= 7', async ({ baseURL }) => {
  const agentId = newAgentId('provider-http');
  const ofThisTurn = isTurnOf(agentId);

  const isProviderRequest = (span: StreamedSpan): boolean =>
    getSpanOp(span) === 'http.client' && String(attr(span, 'server.address') ?? span.name ?? '').includes('openrouter');

  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ofThisTurn(spansOfTrace as StreamedSpan[]) &&
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.generate_content') &&
      spansOfTrace.some(span => isProviderRequest(span as StreamedSpan)),
  );

  await runAgentTurn(baseURL!, agentId, 'What is the weather in Paris?');

  const spans = (await spansPromise) as StreamedSpan[];
  const providerRequest = spans.find(isProviderRequest);
  const invokeAgent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const parent = spans.find(span => span.span_id === providerRequest?.parent_span_id);

  expect(providerRequest?.trace_id).toBe(invokeAgent?.trace_id);
  expect(['gen_ai.generate_content', 'gen_ai.invoke_agent']).toContain(getSpanOp(parent!));

  if ((process.env.AI_SDK_MAJOR ?? '7') !== '6') {
    expect(getSpanOp(parent!)).toBe('gen_ai.generate_content');
  }
});
