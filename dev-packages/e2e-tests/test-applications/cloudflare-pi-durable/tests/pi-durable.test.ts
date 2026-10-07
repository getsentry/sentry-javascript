import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { newAgentId, prompt, submitPrompt, waitForOperation } from './utils';

const APP = 'cloudflare-pi-durable';

test('traces a PiHarness prompt as invoke_agent with chat, execute_tool and provider spans', async ({ baseURL }) => {
  // A run is its own trace, and its `invoke_agent` segment ends last. Only this test calls get_weather.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => span.is_segment && getSpanOp(span) === 'gen_ai.invoke_agent') &&
      spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'get_weather'),
  );

  const answer = await prompt(
    baseURL!,
    newAgentId('weather'),
    'What is the weather in Vienna? Use the get_weather tool.',
  );
  expect(answer.status, answer.reason).toBe('done');

  const spans = await spansPromise;
  const agent = spans.find(span => span.is_segment)!;
  const chats = spans.filter(span => getSpanOp(span) === 'gen_ai.chat');
  // The manual span of the tool is the one way to pick the call that ran, should the model call twice.
  const manualSpan = spans.find(span => span.name === 'resolve-weather')!;
  const tool = spans.find(span => span.span_id === manualSpan.parent_span_id)!;
  const providerCalls = spans.filter(span => getSpanOp(span) === 'http.client');

  expect(agent.attributes['sentry.origin']?.value).toBe('auto.ai.pi_durable');
  // The PiHarness root session is pi conversation 1, in a Harness of its own per Durable Object.
  expect(agent.attributes['gen_ai.conversation.id']?.value).toMatch(/^[0-9a-f]{32}:1$/);
  // The request that submitted the prompt is a trace of its own: the scheduler runs the work.
  expect(spans.some(span => getSpanOp(span) === 'http.server')).toBe(false);
  // pi-durable keeps its state in the `pi_` tables of `PiHarness`, whose statements start no span.
  expect(spans.filter(span => getSpanOp(span) === 'db.query' && /\bpi_/.test(String(span.name)))).toEqual([]);
  // pi-ai sends the requests through `@anthropic-ai/sdk`, whose own integration must stay out so
  // each request is reported once.
  expect(spans.filter(span => String(span.attributes['sentry.origin']?.value).startsWith('auto.ai.'))).toEqual(
    spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ai.pi_durable'),
  );

  // One tool-calling response, then the answer.
  expect(chats.length).toBeGreaterThanOrEqual(2);
  for (const chat of chats) {
    expect(chat.parent_span_id).toBe(agent.span_id);
    expect(chat.attributes['gen_ai.provider.name']?.value).toBe('openrouter');
    expect(chat.attributes['gen_ai.request.model']?.value).toBe('anthropic/claude-haiku-4.5');
    expect(chat.attributes['gen_ai.conversation.id']?.value).toBe(agent.attributes['gen_ai.conversation.id']?.value);
    // pi-durable retries a provider error inside the run; such a request has no usage and no HTTP span
    // of its own to assert on.
    if (chat.status === 'ok') {
      expect(typeof chat.attributes['gen_ai.usage.input_tokens']?.value).toBe('number');
      expect(typeof chat.attributes['gen_ai.usage.output_tokens']?.value).toBe('number');
      expect(providerCalls.some(providerCall => providerCall.parent_span_id === chat.span_id)).toBe(true);
    }
  }

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
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Intentional pi-durable tool failure',
  );
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => span.is_segment && getSpanOp(span) === 'gen_ai.invoke_agent') &&
      spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'fail_now'),
  );

  const answer = await prompt(baseURL!, newAgentId('fail'), 'Call the fail_now tool, then tell me what happened.');
  expect(answer.status, answer.reason).toBe('done');

  const [error, spans] = await Promise.all([errorPromise, spansPromise]);
  // The error is reported on the span of the call that threw.
  const tool = spans.find(span => span.span_id === error.contexts?.trace?.span_id)!;

  expect(tool.attributes['gen_ai.tool.name']?.value).toBe('fail_now');
  expect(tool.status).toBe('error');
  expect(tool.trace_id).toBe(error.contexts?.trace?.trace_id);
  expect(error.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
});

test('resumes a run in a new trace after the Durable Object resets during a tool call', async ({ baseURL }) => {
  const agentId = newAgentId('reset');
  const operationId = crypto.randomUUID();
  // The tool span of the reset object never ends, so a finished `crash_once` span can only come
  // from the rerun after the restart.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => span.is_segment && getSpanOp(span) === 'gen_ai.invoke_agent') &&
      spansOfTrace.some(span => span.attributes['gen_ai.tool.name']?.value === 'crash_once' && span.status === 'ok'),
  );

  // The reset fails the request that submitted the prompt, but pi has stored the input already.
  await submitPrompt(
    baseURL!,
    agentId,
    'Run the crash_once tool for job "nightly", then reply with the word DONE.',
    operationId,
  );
  const answer = await waitForOperation(baseURL!, agentId, operationId);
  expect(answer.status, answer.reason).toBe('done');

  const spans = await spansPromise;
  const agent = spans.find(span => span.is_segment)!;
  const tool = spans.find(span => span.attributes['gen_ai.tool.name']?.value === 'crash_once')!;
  const chats = spans.filter(span => getSpanOp(span) === 'gen_ai.chat');
  const finalAnswer = chats.find(span => span.attributes['gen_ai.response.finish_reasons']?.value === '["stop"]');

  expect(getSpanOp(agent)).toBe('gen_ai.invoke_agent');
  expect(tool.parent_span_id).toBe(agent.span_id);
  expect(finalAnswer?.parent_span_id).toBe(agent.span_id);
  // The request that called the tool ran before the reset, so this trace starts with the rerun of the
  // tool. A run that never reset would start with that request.
  expect(chats.every(chat => chat.start_timestamp >= tool.start_timestamp)).toBe(true);
});
