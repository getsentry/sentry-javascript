import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  getMainCarrier,
  setCurrentClient,
  spanToStaticSpanJSON,
} from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../../../src/ai/anthropic-ai/constants';
import { createFlueInstrumentation } from '../../../../src/ai/flue';
import type { FlueInstrumentation, FlueObservation } from '../../../../src/ai/flue/types';
import { OPENAI_INTEGRATION_NAME } from '../../../../src/ai/openai/constants';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const AGENT_CTX = { agentName: 'Hello' };
const INNER_CTX = { conversationId: 'conv_1' };

/** A settled turn as Flue reports it, with the field names `ModelRequestInfo`/`ModelResponse` use. */
function turn(overrides: Partial<FlueObservation> = {}): FlueObservation {
  return {
    type: 'turn',
    turnId: 'turn_1',
    request: { requestedModel: 'claude-haiku-4.5', providerId: 'anthropic' },
    response: {
      responseId: 'resp_1',
      finishReason: 'stop',
      usage: {
        input: 924,
        output: 57,
        totalTokens: 981,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { input: 0.000924, output: 0.000275, total: 0.001199, cacheRead: 0, cacheWrite: 0 },
      },
    },
    ...overrides,
  };
}

describe('createFlueInstrumentation', () => {
  let endedSpans: Span[];
  let instrumentation: FlueInstrumentation;

  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
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
    instrumentation = createFlueInstrumentation();
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
  });

  /** Run `fn` inside an agent operation, the way Flue's interceptor would. */
  function withAgent<T>(fn: () => Promise<T> | T): Promise<T> {
    return instrumentation.interceptor({ type: 'agent' }, AGENT_CTX, async () => fn());
  }

  function findSpan(description: string): ReturnType<typeof spanToStaticSpanJSON> | undefined {
    return endedSpans.map(span => spanToStaticSpanJSON(span)).find(json => json.description === description);
  }

  // Flue drives the providers through `pi-ai`, which bundles the `openai` / `@anthropic-ai/sdk` /
  // `@google/genai` clients those integrations patch, so their spans duplicate the turn span.
  it('skips raw provider wrapping as soon as the instrumentation is built', () => {
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
  });

  it('names agent spans `invoke_agent {name}` and sets the gen_ai op', async () => {
    await withAgent(() => undefined);

    const json = findSpan('invoke_agent Hello');
    expect(json?.data['sentry.op']).toBe('gen_ai.invoke_agent');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('invoke_agent');
    expect(json?.data['gen_ai.agent.name']).toBe('Hello');
  });

  // The agent operation re-enters once, and only the inner context names the conversation.
  it('lifts the conversation id off the re-entered agent operation', async () => {
    await withAgent(() => instrumentation.interceptor({ type: 'agent' }, INNER_CTX, async () => undefined));

    expect(findSpan('invoke_agent Hello')?.data['gen_ai.conversation.id']).toBe('conv_1');
  });

  it('does not span operations other than `agent`', async () => {
    await instrumentation.interceptor({ type: 'model', turnId: 'turn_1' }, {}, async () => undefined);

    expect(endedSpans).toHaveLength(0);
  });

  it('opens a chat span on turn_start and completes it from the settled turn', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', conversationId: 'conv_1' }, {});
      instrumentation.observe(turn(), {});
    });

    const json = findSpan('chat claude-haiku-4.5');
    expect(json?.data['sentry.op']).toBe('gen_ai.chat');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.request.model']).toBe('claude-haiku-4.5');
    expect(json?.data['gen_ai.provider.name']).toBe('anthropic');
    expect(json?.data['gen_ai.response.id']).toBe('resp_1');
    expect(json?.data['gen_ai.response.finish_reasons']).toEqual(['stop']);
    expect(json?.data['gen_ai.conversation.id']).toBe('conv_1');
  });

  // Flue computes costs itself; the provider SDKs report none.
  it('records token usage and Flue-computed cost on the chat span', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1' }, {});
      instrumentation.observe(turn(), {});
    });

    const json = findSpan('chat claude-haiku-4.5');
    expect(json?.data['gen_ai.usage.input_tokens']).toBe(924);
    expect(json?.data['gen_ai.usage.output_tokens']).toBe(57);
    expect(json?.data['gen_ai.usage.total_tokens']).toBe(981);
    expect(json?.data['gen_ai.cost.total_tokens']).toBe(0.001199);
  });

  it('marks a failed turn as errored', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1' }, {});
      instrumentation.observe(turn({ isError: true }), {});
    });

    expect(findSpan('chat claude-haiku-4.5')?.status).toBe('internal_error');
  });

  // A turn that fails before the provider bills anything reports every counter as 0; writing those
  // reads as a real zero-cost call.
  it('omits usage entirely when a failed turn produced no tokens', async () => {
    const empty = {
      input: 0,
      output: 0,
      totalTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
    };

    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1' }, {});
      instrumentation.observe(turn({ isError: true, response: { usage: empty } }), {});
    });

    const json = findSpan('chat claude-haiku-4.5');
    expect(json).toBeDefined();
    expect(json?.data['gen_ai.usage.total_tokens']).toBeUndefined();
    expect(json?.data['gen_ai.cost.total_tokens']).toBeUndefined();
  });

  describe('content recording', () => {
    const requestContent = {
      type: 'turn_request',
      turnId: 'turn_1',
      request: {
        requestedModel: 'claude-haiku-4.5',
        input: {
          systemPrompt: 'You are helpful.',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [{ name: 'get_weather', description: 'weather', parameters: {} }],
        },
      },
    } satisfies FlueObservation;

    async function record(instr: FlueInstrumentation): Promise<void> {
      await instr.interceptor({ type: 'agent' }, AGENT_CTX, async () => {
        instr.observe({ type: 'turn_start', turnId: 'turn_1' }, {});
        instr.observe(requestContent, {});
        instr.observe(turn({ response: { ...turn().response, output: { role: 'assistant' } } }), {});
        instr.observe({ type: 'tool_start', toolCallId: 'c1', toolName: 'get_weather', args: { city: 'Berlin' } }, {});
        instr.observe({ type: 'tool', toolCallId: 'c1', toolName: 'get_weather', result: 'sunny' }, {});
      });
    }

    it('records messages, instructions, tool definitions, arguments and results by default', async () => {
      await record(instrumentation);

      const chat = findSpan('chat claude-haiku-4.5');
      expect(chat?.data['gen_ai.system_instructions']).toBe('You are helpful.');
      expect(chat?.data['gen_ai.input.messages']).toContain('"role":"user"');
      expect(chat?.data['gen_ai.output.messages']).toContain('"role":"assistant"');
      expect(chat?.data['gen_ai.tool.definitions']).toContain('get_weather');

      const tool = findSpan('execute_tool get_weather');
      expect(tool?.data['gen_ai.tool.call.arguments']).toBe('{"city":"Berlin"}');
      expect(tool?.data['gen_ai.tool.call.result']).toBe('sunny');
    });

    it('omits inputs when recordInputs is false but keeps outputs', async () => {
      await record(createFlueInstrumentation({ recordInputs: false }));

      const chat = findSpan('chat claude-haiku-4.5');
      expect(chat?.data['gen_ai.input.messages']).toBeUndefined();
      expect(chat?.data['gen_ai.system_instructions']).toBeUndefined();
      expect(chat?.data['gen_ai.tool.definitions']).toBeUndefined();
      expect(chat?.data['gen_ai.output.messages']).toBeDefined();
      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.arguments']).toBeUndefined();
    });

    it('omits outputs when recordOutputs is false but keeps inputs', async () => {
      await record(createFlueInstrumentation({ recordOutputs: false }));

      const chat = findSpan('chat claude-haiku-4.5');
      expect(chat?.data['gen_ai.output.messages']).toBeUndefined();
      expect(chat?.data['gen_ai.input.messages']).toBeDefined();
      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.result']).toBeUndefined();
    });
  });

  it('emits execute_tool spans keyed by tool call id', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather' }, {});
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'get_weather' }, {});
    });

    const json = findSpan('execute_tool get_weather');
    expect(json?.data['sentry.op']).toBe('gen_ai.execute_tool');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('execute_tool');
    expect(json?.data['gen_ai.tool.name']).toBe('get_weather');
  });

  it('marks a failed tool call as errored', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'call_1', toolName: 'boom' }, {});
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'boom', isError: true }, {});
    });

    expect(findSpan('execute_tool boom')?.status).toBe('internal_error');
  });

  it('ignores a settled turn or tool it never opened a span for', async () => {
    await withAgent(() => {
      instrumentation.observe(turn({ turnId: 'never_started' }), {});
      instrumentation.observe({ type: 'tool', toolCallId: 'never_started', toolName: 'x' }, {});
    });

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['invoke_agent Hello']);
  });

  it('ends spans still open at dispose', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1' }, {});
      instrumentation.observe({ type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather' }, {});
    });
    // Never settled, so the span keeps the unqualified name it opened with.
    expect(findSpan('chat')).toBeUndefined();

    instrumentation.dispose();

    expect(findSpan('chat')).toBeDefined();
    expect(findSpan('execute_tool get_weather')).toBeDefined();
  });
});
