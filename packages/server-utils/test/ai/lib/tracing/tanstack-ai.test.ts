import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  captureMessage,
  getActiveSpan,
  getMainCarrier,
  setCurrentClient,
  spanToStaticSpanJSON,
} from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../../../src/ai/anthropic-ai/constants';
import { OPENAI_INTEGRATION_NAME } from '../../../../src/ai/openai/constants';
import { createTanstackAiMiddleware } from '../../../../src/ai/tanstack-ai';
import type { TanstackAiMiddlewareConfig, TanstackAiMiddlewareContext } from '../../../../src/ai/tanstack-ai/types';
import { skipProviderIntegrations } from '../../../../src/ai/tanstack-ai/utils';
import { WORKERS_AI_INTEGRATION_NAME } from '../../../../src/ai/workers-ai/constants';
import { AWS_BEDROCK_INTEGRATION_NAME } from '../../../../src/integrations/aws-sdk/constants';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

// TanStack creates one context per `chat()` call and the middleware keys its state by it, so every test
// spreads its own copy.
const CTX: TanstackAiMiddlewareContext = {
  activity: 'chat',
  phase: 'init',
  provider: 'openrouter-responses',
  model: 'openai/gpt-4o-mini',
  threadId: 'thread-1',
  streaming: true,
  callMetadata: {},
  messages: [],
  systemPrompts: [],
};

const CONFIG: TanstackAiMiddlewareConfig = {
  messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
  systemPrompts: [],
  tools: [],
};

describe('createTanstackAiMiddleware', () => {
  let endedSpans: Span[];
  let client: TestClient;

  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle: 'stream',
      }),
    );
    setCurrentClient(client);
    client.init();

    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('reports the provider and response fields from the call metadata', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    // TanStack sets the call metadata when the model call starts, after `onStart`.
    ctx.phase = 'beforeModel';
    ctx.callMetadata = { source: { provider: 'openrouter', api: 'responses' } };
    middleware.onConfig(ctx, CONFIG);
    ctx.callMetadata = { ...ctx.callMetadata, model: 'openai/gpt-4o-mini-2024-07-18', responseId: 'gen-123' };
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'stop' });
    middleware.onFinish(ctx);

    const chat = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.chat');
    const agent = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.invoke_agent');
    expect(chat?.data).toMatchObject({
      'gen_ai.provider.name': 'openrouter',
      'gen_ai.response.model': 'openai/gpt-4o-mini-2024-07-18',
      'gen_ai.response.id': 'gen-123',
      'gen_ai.response.finish_reasons': '["stop"]',
    });
    expect(agent?.data['gen_ai.provider.name']).toBe('openrouter');
  });

  it('records the input of the run and the answer of the last model call on the agent span', () => {
    const middleware = createTanstackAiMiddleware({ recordInputs: true, recordOutputs: true });
    const ctx = { ...CTX };

    middleware.onConfig(ctx, { ...CONFIG, systemPrompts: ['Be brief.'] });
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onChunk(ctx, { type: 'TOOL_CALL_START', toolCallId: 'call-1', toolCallName: 'get_weather' });
    middleware.onChunk(ctx, { type: 'TOOL_CALL_END', toolCallId: 'call-1', input: { city: 'Vienna' } });
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'tool_calls', responseId: 'gen-1' });
    ctx.phase = 'afterModel';
    middleware.onInterruptBoundary(ctx);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onChunk(ctx, { type: 'TEXT_MESSAGE_CONTENT', delta: 'Sunny' });
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'stop', responseId: 'gen-2', model: 'gpt-4o-mini' });
    middleware.onFinish(ctx);

    const agent = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.invoke_agent');
    expect(agent?.data).toMatchObject({
      'gen_ai.input.messages': '[{"role":"user","parts":[{"type":"text","content":"What is the weather in Vienna?"}]}]',
      'gen_ai.system_instructions': 'Be brief.',
      'gen_ai.response.id': 'gen-2',
      'gen_ai.response.model': 'gpt-4o-mini',
      'gen_ai.output.messages':
        '[{"role":"assistant","parts":[{"type":"text","content":"Sunny"}],"finish_reason":"stop"}]',
    });
    // The finish reason belongs to a single model call.
    expect(agent?.data).not.toHaveProperty('gen_ai.response.finish_reasons');
  });

  it('sums the usage and provider cost of every model call on the agent span', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onUsage(ctx, { promptTokens: 10, completionTokens: 2, totalTokens: 12, cost: 0.001 });
    ctx.phase = 'afterModel';
    middleware.onInterruptBoundary(ctx);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    // OpenRouter with a BYOK key: its fee is 0, and the provider's charge is the upstream cost.
    middleware.onUsage(ctx, {
      promptTokens: 20,
      completionTokens: 5,
      totalTokens: 25,
      cost: 0,
      costDetails: { upstreamCost: 0.002 },
      promptTokensDetails: { cachedTokens: 8 },
    });
    middleware.onFinish(ctx);

    const agent = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.invoke_agent');
    expect(agent?.data).toMatchObject({
      'gen_ai.usage.input_tokens': 30,
      'gen_ai.usage.output_tokens': 7,
      'gen_ai.usage.total_tokens': 37,
      'gen_ai.usage.cache_read.input_tokens': 8,
      'gen_ai.cost.total_tokens': 0.003,
    });
    expect(endedSpans.filter(span => spanToStaticSpanJSON(span).op === 'gen_ai.chat')).toHaveLength(2);
  });

  it('leaves out a cost of 0, so Relay computes the cost from the token counts', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onUsage(ctx, { promptTokens: 10, completionTokens: 2, totalTokens: 12, cost: 0 });
    middleware.onFinish(ctx);

    const spans = endedSpans.map(span => spanToStaticSpanJSON(span));
    expect(spans).toHaveLength(2);
    expect(spans.every(span => span.data['gen_ai.usage.input_tokens'] === 10)).toBe(true);
    expect(spans.some(span => 'gen_ai.cost.total_tokens' in span.data)).toBe(false);
  });

  it('marks a failed tool call and captures its error, which TanStack hands to the model', async () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };
    const tool = { name: 'get_weather', execute: () => undefined };

    middleware.onConfig(ctx, CONFIG);
    middleware.onGuardToolCall(ctx, { toolName: 'get_weather', toolCallId: 'call-1', args: { city: 'Vienna' }, tool });
    middleware.onAfterToolCall(ctx, { toolCallId: 'call-1', ok: false, error: new TypeError('kaboom') });
    middleware.onFinish(ctx);
    await client.flush();

    const toolSpan = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.execute_tool');
    expect(toolSpan?.status).toBe('internal_error');
    expect(toolSpan?.data).toMatchObject({
      'gen_ai.tool.call.id': 'call-1',
      'gen_ai.tool.call.arguments': '{"city":"Vienna"}',
    });
    const exception = client.event?.exception?.values?.[0];
    expect(exception?.value).toBe('kaboom');
    expect(exception?.mechanism).toEqual({ type: 'auto.ai.tanstack_ai', handled: true });
  });

  it('records no tool span for a client tool, which runs in the browser', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    middleware.onGuardToolCall(ctx, {
      toolName: 'pick_color',
      toolCallId: 'call-1',
      args: {},
      tool: { name: 'pick_color' },
    });
    middleware.onFinish(ctx);

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).op)).toEqual(['gen_ai.invoke_agent']);
  });

  it('ends every open span with an error status when the run fails', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };
    const tool = { name: 'get_weather', execute: () => undefined };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onGuardToolCall(ctx, { toolName: 'get_weather', toolCallId: 'call-1', args: {}, tool });
    middleware.onError(ctx, { error: new Error('provider down') });

    expect(endedSpans.map(span => [spanToStaticSpanJSON(span).op, spanToStaticSpanJSON(span).status])).toEqual([
      ['gen_ai.execute_tool', 'internal_error'],
      ['gen_ai.chat', 'internal_error'],
      ['gen_ai.invoke_agent', 'internal_error'],
    ]);
  });

  it('ends the run with an error status when the provider error arrives as a chunk', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    // `chat({ stream: false })` throws on this chunk and stops reading, so no terminal hook follows.
    middleware.onChunk(ctx, { type: 'RUN_ERROR' });

    expect(endedSpans.map(span => [spanToStaticSpanJSON(span).op, spanToStaticSpanJSON(span).status])).toEqual([
      ['gen_ai.chat', 'internal_error'],
      ['gen_ai.invoke_agent', 'internal_error'],
    ]);
  });

  it('marks an aborted run as cancelled', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onAbort(ctx);

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).status)).toEqual(['cancelled', 'cancelled']);
  });

  it('marks the provider error that ends an aborted run as cancelled', () => {
    const middleware = createTanstackAiMiddleware();
    const abortController = new AbortController();
    const ctx = { ...CTX, signal: abortController.signal };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    abortController.abort();
    // TanStack yields the held error of a rate-limited call when an abort ends the wait for the retry.
    middleware.onChunk(ctx, { type: 'RUN_ERROR' });

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).status)).toEqual(['cancelled', 'cancelled']);
  });

  it('marks a tool call that fails because the run was aborted as cancelled, and captures no error', async () => {
    const middleware = createTanstackAiMiddleware();
    const abortController = new AbortController();
    const ctx = { ...CTX, signal: abortController.signal };
    const tool = { name: 'get_weather', execute: () => undefined };
    const sendEvent = vi.spyOn(client, 'sendEvent');

    middleware.onConfig(ctx, CONFIG);
    middleware.onGuardToolCall(ctx, { toolName: 'get_weather', toolCallId: 'call-1', args: {}, tool });
    abortController.abort();
    middleware.onAfterToolCall(ctx, { toolCallId: 'call-1', ok: false, error: new Error('Operation aborted') });
    middleware.onAbort(ctx);
    // Sentinel: once this event is sent, an event for the tool error would have been sent before it.
    captureMessage('sentinel');
    await client.flush();

    const toolSpan = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.execute_tool');
    expect(toolSpan?.status).toBe('cancelled');
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'sentinel' }), expect.anything());
  });

  it('ends a model call that a middleware retried with an error status', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    // The `RUN_ERROR` of a call that `ctx.retry()` retries never reaches `onChunk`. TanStack runs `onConfig` again.
    middleware.onConfig(ctx, CONFIG);
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'stop' });
    ctx.phase = 'afterModel';
    middleware.onInterruptBoundary(ctx);
    middleware.onFinish(ctx);

    expect(endedSpans.map(span => [spanToStaticSpanJSON(span).op, spanToStaticSpanJSON(span).status])).toEqual([
      ['gen_ai.chat', 'internal_error'],
      ['gen_ai.chat', 'ok'],
      ['gen_ai.invoke_agent', 'ok'],
    ]);
  });

  it('ends the run when it pauses at an interrupt, for which TanStack calls no terminal hook', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'stop', outcome: { type: 'interrupt' } });

    expect(endedSpans.map(span => [spanToStaticSpanJSON(span).op, spanToStaticSpanJSON(span).status])).toEqual([
      ['gen_ai.chat', 'ok'],
      ['gen_ai.invoke_agent', 'ok'],
    ]);
  });

  it('ends the chat span after the model call, before the tools run', () => {
    const middleware = createTanstackAiMiddleware();
    const ctx = { ...CTX };
    const tool = { name: 'get_weather', execute: () => undefined };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'afterModel';
    middleware.onInterruptBoundary(ctx);
    middleware.onGuardToolCall(ctx, { toolName: 'get_weather', toolCallId: 'call-1', args: {}, tool });
    middleware.onAfterToolCall(ctx, { toolCallId: 'call-1', ok: true, result: 'sunny' });
    middleware.onFinish(ctx);

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).op)).toEqual([
      'gen_ai.chat',
      'gen_ai.execute_tool',
      'gen_ai.invoke_agent',
    ]);
  });

  it('keeps the tool spans of two runs apart when their tool calls have the same id', () => {
    const middleware = createTanstackAiMiddleware();
    const first = { ...CTX, threadId: 'thread-1' };
    const second = { ...CTX, threadId: 'thread-2' };
    const tool = { name: 'get_weather', execute: () => undefined };

    middleware.onConfig(first, CONFIG);
    middleware.onConfig(second, CONFIG);
    middleware.onGuardToolCall(first, { toolName: 'get_weather', toolCallId: 'get_weather_1', args: {}, tool });
    middleware.onGuardToolCall(second, { toolName: 'get_weather', toolCallId: 'get_weather_1', args: {}, tool });
    middleware.onAfterToolCall(first, { toolCallId: 'get_weather_1', ok: true, result: 'sunny' });
    middleware.onAfterToolCall(second, { toolCallId: 'get_weather_1', ok: true, result: 'rainy' });

    const tools = endedSpans.map(span => spanToStaticSpanJSON(span)).filter(span => span.op === 'gen_ai.execute_tool');
    expect(tools.map(span => [span.data['gen_ai.conversation.id'], span.data['gen_ai.tool.call.result']])).toEqual([
      ['thread-1', 'sunny'],
      ['thread-2', 'rainy'],
    ]);
  });

  it('records the messages that a middleware sends to the provider instead of the history', () => {
    const middleware = createTanstackAiMiddleware({ recordInputs: true });
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, { ...CONFIG, providerMessages: [{ role: 'user', content: 'Weather in Vienna?' }] });
    middleware.onFinish(ctx);

    const chat = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.chat');
    expect(chat?.data['gen_ai.input.messages']).toBe(
      '[{"role":"user","parts":[{"type":"text","content":"Weather in Vienna?"}]}]',
    );
  });

  it('records the provider of the structured output call, and no tools, which that call does not send', () => {
    const middleware = createTanstackAiMiddleware({ recordInputs: true });
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    // Without tools, the structured output call is the only model call, and TanStack sets its call metadata after
    // `onConfig`.
    ctx.phase = 'structuredOutput';
    middleware.onConfig(ctx, { ...CONFIG, tools: [{ name: 'get_weather', description: 'Get the weather.' }] });
    ctx.callMetadata = { source: { provider: 'openrouter', api: 'responses' } };
    middleware.onChunk(ctx, { type: 'RUN_FINISHED', finishReason: 'stop' });
    middleware.onFinish(ctx);

    const spans = endedSpans.map(span => spanToStaticSpanJSON(span));
    expect(spans.map(span => span.data['gen_ai.provider.name'])).toEqual(['openrouter', 'openrouter']);
    expect(spans.find(span => span.op === 'gen_ai.chat')?.data).not.toHaveProperty('gen_ai.tool.definitions');
  });

  it('leaves out the tool definitions when inputs are not recorded', () => {
    const middleware = createTanstackAiMiddleware({ recordInputs: false });
    const ctx = { ...CTX };

    middleware.onConfig(ctx, CONFIG);
    ctx.phase = 'beforeModel';
    middleware.onConfig(ctx, { ...CONFIG, tools: [{ name: 'get_weather', description: 'Get the weather.' }] });
    middleware.onFinish(ctx);

    const chat = endedSpans.map(span => spanToStaticSpanJSON(span)).find(span => span.op === 'gen_ai.chat');
    expect(chat?.data).not.toHaveProperty('gen_ai.tool.definitions');
  });

  it('runs each tool with the tool span of its own run active, also when two runs have the same tool call id', async () => {
    const middleware = createTanstackAiMiddleware();
    const getWeather = {
      name: 'get_weather',
      execute: () => spanToStaticSpanJSON(getActiveSpan()!).data['gen_ai.conversation.id'],
    };
    const first = { ...CTX, threadId: 'thread-1' };
    const second = { ...CTX, threadId: 'thread-2' };

    const [firstTool] = middleware.onConfig(first, { ...CONFIG, tools: [getWeather] })!.tools!;
    const [secondTool] = middleware.onConfig(second, { ...CONFIG, tools: [getWeather] })!.tools!;
    middleware.onGuardToolCall(first, {
      toolName: 'get_weather',
      toolCallId: 'get_weather_1',
      args: {},
      tool: firstTool,
    });
    middleware.onGuardToolCall(second, {
      toolName: 'get_weather',
      toolCallId: 'get_weather_1',
      args: {},
      tool: secondTool,
    });

    expect([
      await firstTool!.execute!({}, { toolCallId: 'get_weather_1' }),
      await secondTool!.execute!({}, { toolCallId: 'get_weather_1' }),
    ]).toEqual(['thread-1', 'thread-2']);
  });
});

describe('skipProviderIntegrations', () => {
  it('skips every provider integration during a call, also after an await, but not after the call', async () => {
    // `@tanstack/openai-base` lets an adapter have a name of its own.
    const adapter = skipProviderIntegrations({
      name: 'deepseek',
      async structuredOutput() {
        await Promise.resolve();
        return [
          _INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME),
          _INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME),
          _INTERNAL_shouldSkipAiProviderWrapping(WORKERS_AI_INTEGRATION_NAME),
          _INTERNAL_shouldSkipAiProviderWrapping(AWS_BEDROCK_INTEGRATION_NAME),
        ];
      },
    });

    expect(await adapter.structuredOutput()).toEqual([true, true, true, true]);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
  });

  it('skips the integrations in the body of a returned async generator, but not in the code that reads it', async () => {
    const adapter = skipProviderIntegrations({
      name: 'openai-chat',
      async *chatStream() {
        yield _INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME);
        await Promise.resolve();
        yield _INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME);
      },
    });

    const skipped: boolean[] = [];
    for await (const skippedInAdapter of adapter.chatStream()) {
      skipped.push(skippedInAdapter, _INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME));
    }

    expect(skipped).toEqual([true, false, true, false]);
  });

  it('calls the methods on the adapter itself, so that they can read its private fields', async () => {
    class Adapter {
      public readonly name = 'openai-chat';
      readonly #model = 'gpt-4o';

      public async structuredOutput(): Promise<string> {
        return this.#model;
      }
    }

    const adapter = skipProviderIntegrations(new Adapter());

    expect(await adapter.structuredOutput()).toBe('gpt-4o');
  });

  it('returns the same function for each read of a method, and the constructor and frozen methods as they are', () => {
    class Adapter {
      public async structuredOutput(): Promise<string> {
        return 'ok';
      }
    }
    const frozen = Object.freeze({ chatStream: () => 'frozen' });

    const adapter = skipProviderIntegrations(new Adapter());

    expect(adapter.structuredOutput).toBe(adapter.structuredOutput);
    expect(adapter.constructor).toBe(Adapter);
    expect(skipProviderIntegrations(frozen).chatStream).toBe(frozen.chatStream);
  });
});
