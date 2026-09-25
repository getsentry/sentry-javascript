import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { newConversationId, runAgentTurn } from './utils';

const APP = 'cloudflare-flue';

type SpanLike = { name?: string; attributes?: Record<string, { value?: unknown }> };

const usedTool = (toolName: string) => (spansOfTrace: SpanLike[]) =>
  spansOfTrace.some(span => span.attributes?.['gen_ai.tool.name']?.value === toolName);

/**
 * This app never calls `instrument()`. On Cloudflare the registration comes from the build:
 * `@sentry/cloudflare/vite` provides the `@flue/runtime` binding and the orchestrion registration
 * installs `flueIntegration()`. So any `gen_ai` span here is itself the proof that the auto-wiring
 * worked — a manual-registration regression shows up as an empty trace, not a wrong attribute.
 */
test('instruments a Flue agent with no manual instrument() call', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.invoke_agent') && usedTool('get_weather')(spansOfTrace),
  );

  await runAgentTurn(baseURL!, newConversationId('weather'), 'What is the weather in Paris?');

  const spans = await spansPromise;
  const invokeAgent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const chat = spans.find(span => getSpanOp(span) === 'gen_ai.chat');
  const executeTool = spans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

  expect(invokeAgent?.attributes?.['sentry.origin']?.value).toBe('auto.ai.flue');
  expect(invokeAgent?.attributes?.['gen_ai.agent.name']?.value).toBe('Hello');

  expect(chat?.attributes?.['sentry.origin']?.value).toBe('auto.ai.flue');
  expect(chat?.attributes?.['gen_ai.provider.name']?.value).toBe('openrouter');
  expect(typeof chat?.attributes?.['gen_ai.usage.input_tokens']?.value).toBe('number');
  expect(typeof chat?.attributes?.['gen_ai.cost.total_tokens']?.value).toBe('number');

  expect(executeTool?.attributes?.['gen_ai.tool.name']?.value).toBe('get_weather');
  expect(chat?.parent_span_id).toBe(invokeAgent?.span_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.span_id);
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
  expect(manualSpan?.parent_span_id).toBe(executeTool?.span_id);
});
