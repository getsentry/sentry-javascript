import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { newConversationId, runAgentTurn } from './utils';

const APP = 'node-flue-vite';

// The Sentry Vite plugin bundles `@flue/runtime` and pi-ai, so their spans come from the bundled copies.
test('captures the invoke_agent / chat / execute_tool hierarchy for a Flue turn', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ['gen_ai.invoke_agent', 'gen_ai.chat', 'gen_ai.execute_tool'].every(op =>
        spansOfTrace.some(span => getSpanOp(span) === op),
      ) && spansOfTrace.some(span => span.attributes?.['gen_ai.tool.name']?.value === 'get_weather'),
  );

  await runAgentTurn(baseURL!, newConversationId('weather'), 'What is the weather in Paris?');

  const spans = await spansPromise;
  const invokeAgent = spans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const chats = spans.filter(span => getSpanOp(span) === 'gen_ai.chat');
  const executeTool = spans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

  expect(invokeAgent?.attributes?.['sentry.origin']?.value).toBe('auto.ai.flue');
  expect(chats[0]?.attributes?.['sentry.origin']?.value).toBe('auto.ai.pi_ai');
  expect(executeTool?.attributes?.['gen_ai.tool.name']?.value).toBe('get_weather');
  expect(chats[0]?.parent_span_id).toBe(invokeAgent?.span_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.span_id);
});
