import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { createConversation, sendMessage } from './utils';

const APP = 'node-pi-durable';

test('traces a run as invoke_agent with chat, execute_tool and provider spans', async ({ baseURL }) => {
  const conversationId = await createConversation(baseURL!);
  // A run is its own trace, and its `invoke_agent` segment ends last.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(
        span =>
          span.is_segment && String(span.attributes['gen_ai.conversation.id']?.value).endsWith(`:${conversationId}`),
      ) && spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'get_weather'),
  );

  const settled = await sendMessage(
    baseURL!,
    conversationId,
    'What is the weather in Vienna? Use the get_weather tool.',
  );
  expect(settled.status, settled.detail).toBe('done');

  const spans = await spansPromise;
  const agent = spans.find(span => span.is_segment)!;
  const chats = spans.filter(span => getSpanOp(span) === 'gen_ai.chat');
  // The manual span of the tool is the one way to pick the call that ran, should the model call twice.
  const manualSpan = spans.find(span => span.name === 'resolve-weather')!;
  const tool = spans.find(span => span.span_id === manualSpan.parent_span_id)!;
  const providerCalls = spans.filter(span => getSpanOp(span) === 'http.client');

  expect(getSpanOp(agent)).toBe('gen_ai.invoke_agent');
  expect(agent.attributes['sentry.origin']?.value).toBe('auto.ai.pi_durable');
  // The request that submitted the input is a trace of its own: the scheduler runs the work later.
  expect(spans.some(span => getSpanOp(span) === 'http.server')).toBe(false);
  // pi-ai sends the requests through `@anthropic-ai/sdk`, whose own integration must stay out so
  // each request is reported once.
  expect(spans.filter(span => String(span.attributes['sentry.origin']?.value).startsWith('auto.ai.'))).toEqual(
    spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ai.pi_durable'),
  );

  // One tool-calling response, then the answer.
  expect(chats.length).toBeGreaterThanOrEqual(2);
  for (const chat of chats) {
    expect(chat.parent_span_id).toBe(agent.span_id);
    expect(chat.attributes['sentry.origin']?.value).toBe('auto.ai.pi_durable');
    expect(chat.attributes['gen_ai.provider.name']?.value).toBe('openrouter');
    expect(chat.attributes['gen_ai.request.model']?.value).toBe('anthropic/claude-haiku-4.5');
    // pi-durable retries a provider error inside the run; such a request has no usage and no HTTP span
    // of its own to assert on.
    if (chat.status === 'ok') {
      expect(typeof chat.attributes['gen_ai.usage.input_tokens']?.value).toBe('number');
      expect(typeof chat.attributes['gen_ai.usage.output_tokens']?.value).toBe('number');
      expect(typeof chat.attributes['gen_ai.cost.total_tokens']?.value).toBe('number');
      expect(providerCalls.some(providerCall => providerCall.parent_span_id === chat.span_id)).toBe(true);
    }
  }

  // The request after the tool round carries the tool call and its result in the conventions shape.
  const answerInput = JSON.parse(
    String(
      chats.find(chat => chat.attributes['gen_ai.response.finish_reasons']?.value === '["stop"]')!.attributes[
        'gen_ai.input.messages'
      ]?.value,
    ),
  ) as { role: string; parts: { type: string }[] }[];
  expect(answerInput.map(message => message.role)).toContain('tool');
  expect(answerInput.flatMap(message => message.parts.map(part => part.type))).toEqual(
    expect.arrayContaining(['tool_call', 'tool_call_response']),
  );

  expect(tool.attributes['gen_ai.tool.name']?.value).toBe('get_weather');
  expect(tool.parent_span_id).toBe(agent.span_id);
  expect(tool.status).toBe('ok');
  expect(tool.attributes['gen_ai.tool.call.arguments']?.value).toContain('Vienna');
  expect(tool.attributes['gen_ai.tool.call.result']?.value).toContain('21 degrees and sunny in');

  // The provider's HTTP calls nest inside the `chat` span that sent them.
  expect(providerCalls.length).toBeGreaterThan(0);
  for (const providerCall of providerCalls) {
    expect(chats.map(chat => chat.span_id)).toContain(providerCall.parent_span_id);
    expect(providerCall.attributes['server.address']?.value).toBe('openrouter.ai');
  }
});

test('reports a throwing tool as an error on its execute_tool span', async ({ baseURL }) => {
  const conversationId = await createConversation(baseURL!);
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Intentional pi-durable tool failure',
  );
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(
        span =>
          span.is_segment && String(span.attributes['gen_ai.conversation.id']?.value).endsWith(`:${conversationId}`),
      ) && spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'fail_now'),
  );

  const settled = await sendMessage(baseURL!, conversationId, 'Call the fail_now tool, then tell me what happened.');
  expect(settled.status, settled.detail).toBe('done');

  const [error, spans] = await Promise.all([errorPromise, spansPromise]);
  // The error is reported on the span of the call that threw.
  const tool = spans.find(span => span.span_id === error.contexts?.trace?.span_id)!;

  expect(tool.attributes['gen_ai.tool.name']?.value).toBe('fail_now');
  expect(tool.status).toBe('error');
  expect(tool.trace_id).toBe(error.contexts?.trace?.trace_id);
  expect(error.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: true });
});

test('nests a subagent run under the tool call that delegated to it', async ({ baseURL }) => {
  const conversationId = await createConversation(baseURL!);
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(
        span =>
          span.is_segment && String(span.attributes['gen_ai.conversation.id']?.value).endsWith(`:${conversationId}`),
      ) && spansOfTrace.some(span => !span.is_segment && getSpanOp(span) === 'gen_ai.invoke_agent'),
  );

  const settled = await sendMessage(
    baseURL!,
    conversationId,
    'Use the delegate tool to ask a subagent: "What is 2 + 2? Reply with only the number." Then reply with its answer.',
  );
  expect(settled.status, settled.detail).toBe('done');

  const spans = await spansPromise;
  const agent = spans.find(span => span.is_segment)!;
  const delegate = spans.find(span => span.attributes['gen_ai.tool.name']?.value === 'delegate')!;
  const subagent = spans.find(span => !span.is_segment && getSpanOp(span) === 'gen_ai.invoke_agent')!;
  const subagentChat = spans.find(
    span => getSpanOp(span) === 'gen_ai.chat' && span.parent_span_id === subagent.span_id,
  );

  expect(delegate.parent_span_id).toBe(agent.span_id);
  expect(subagent.parent_span_id).toBe(delegate.span_id);
  expect(subagentChat).toBeDefined();

  // The subagent has a conversation of its own, in the same Harness.
  const [agentHarness, agentConversation] = String(agent.attributes['gen_ai.conversation.id']?.value).split(':');
  const [subagentHarness, subagentConversation] = String(subagent.attributes['gen_ai.conversation.id']?.value).split(
    ':',
  );
  expect(subagentHarness).toBe(agentHarness);
  expect(subagentConversation).not.toBe(agentConversation);
});

test('resumes a run in a new trace after the server crashes during a tool call', async ({ baseURL }) => {
  const conversationId = await createConversation(baseURL!);
  // The tool span of the crashed process never ends, so a finished `flaky_step` span can only come
  // from the rerun in the restarted server.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(
        span =>
          span.is_segment && String(span.attributes['gen_ai.conversation.id']?.value).endsWith(`:${conversationId}`),
      ) &&
      spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'flaky_step' && span.status === 'ok'),
  );

  const settled = await sendMessage(
    baseURL!,
    conversationId,
    'Run the flaky step for job "nightly" with the flaky_step tool, then reply with the word DONE.',
  );
  expect(settled.status, settled.detail).toBe('done');

  const spans = await spansPromise;
  const agent = spans.find(span => span.is_segment)!;
  const tool = spans.find(span => span.attributes['gen_ai.tool.name']?.value === 'flaky_step')!;
  const chats = spans.filter(span => getSpanOp(span) === 'gen_ai.chat');
  const answer = chats.find(span => span.attributes['gen_ai.response.finish_reasons']?.value === '["stop"]');

  expect(getSpanOp(agent)).toBe('gen_ai.invoke_agent');
  expect(tool.parent_span_id).toBe(agent.span_id);
  expect(answer?.parent_span_id).toBe(agent.span_id);
  // The request that called the tool ran in the crashed process, so this trace starts with the rerun
  // of the tool. A run that never crashed would start with that request.
  expect(chats.every(chat => chat.start_timestamp >= tool.start_timestamp)).toBe(true);
});
