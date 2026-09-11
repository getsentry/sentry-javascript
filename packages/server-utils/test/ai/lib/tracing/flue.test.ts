import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  getMainCarrier,
  setCurrentClient,
  spanToStaticSpanJSON,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../../../src/ai/anthropic-ai/constants';
import { createFlueInstrumentation } from '../../../../src/ai/flue';
import { MAX_TRACKED_FLUE_SPANS } from '../../../../src/ai/flue/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../../../../src/ai/google-genai/constants';
import type { FlueInstrumentation, FlueObservation } from '../../../../src/ai/flue/types';
import { OPENAI_INTEGRATION_NAME } from '../../../../src/ai/openai/constants';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const AGENT_OP = { type: 'agent', operationId: 'op_1' };
const AGENT_CTX = { agentName: 'Hello', submissionId: 'sub_1' };
const INNER_CTX = { conversationId: 'conv_1' };

/** A settled turn as Flue reports it, with the field names `ModelRequestInfo`/`ModelResponse` use. */
function turn(overrides: Partial<FlueObservation> = {}): FlueObservation {
  return {
    type: 'turn',
    turnId: 'turn_1',
    submissionId: 'sub_1',
    operationId: 'op_1',
    request: {
      requestedModel: 'claude-haiku-4.5',
      providerId: 'anthropic',
      temperature: 0.7,
      maxTokens: 1024,
      reasoningLevel: 'high',
      serverAddress: 'api.anthropic.com',
      serverPort: 443,
    },
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
    return instrumentation.interceptor(AGENT_OP, AGENT_CTX, async () => fn());
  }

  function agentSpans(): ReturnType<typeof spanToStaticSpanJSON>[] {
    return endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .filter(json => json.data['sentry.op'] === 'gen_ai.invoke_agent');
  }

  function findSpan(description: string): ReturnType<typeof spanToStaticSpanJSON> | undefined {
    return endedSpans.map(span => spanToStaticSpanJSON(span)).find(json => json.description === description);
  }

  // Flue drives the providers through `pi-ai`, which bundles the `openai` / `@anthropic-ai/sdk` /
  // `@google/genai` clients those integrations patch, so their spans duplicate the turn span.
  // Not at construction: if `instrument()` rejects the object, suppressing the provider
  // integrations would leave the app with no `gen_ai.chat` spans at all.
  it('skips raw provider wrapping on first use, not on construction', async () => {
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

    await withAgent(() => undefined);

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
  });

  // The registry is reset per client (`_setupIntegrations` clears it, and Cloudflare calls `init()`
  // per request), so a one-shot call at construction is wiped by the next reset.
  it('re-applies the provider skip after the registry is cleared', async () => {
    await withAgent(() => undefined);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);

    _INTERNAL_clearAiProviderSkips();
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

    await withAgent(() => undefined);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
  });

  // The guard has to hold for every provider, not just the first: another integration may have
  // registered a skip for one of them already, which would otherwise short-circuit the rest.
  it('applies the skip to every provider when only some are already registered', async () => {
    _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);

    await withAgent(() => undefined);

    expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
    expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(true);
  });

  // A turn whose stream is abandoned never emits the settled `turn` that would remove it, so the
  // tracker is capped. Eviction has to end the span it drops, or it is never sent.
  it('ends the oldest chat span when the turn tracker overflows', async () => {
    await withAgent(() => {
      for (let i = 0; i <= MAX_TRACKED_FLUE_SPANS; i++) {
        instrumentation.observe({ type: 'turn_start', turnId: `turn_${i}`, operationId: 'op_1' }, {});
      }
    });

    expect(endedSpans.filter(span => spanToStaticSpanJSON(span).data['sentry.op'] === 'gen_ai.chat')).toHaveLength(1);
  });

  it('names agent spans `invoke_agent {name}` and sets the gen_ai op', async () => {
    await withAgent(() => undefined);

    const json = findSpan('invoke_agent Hello');
    expect(json?.data['sentry.op']).toBe('gen_ai.invoke_agent');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('invoke_agent');
    expect(json?.data['gen_ai.agent.name']).toBe('Hello');
  });

  // The agent span opens before the conversation is known — the submission-scoped operation names
  // the agent, and the conversation arrives on the observations that follow.
  it('sets the conversation id on the agent span from the observations', async () => {
    await withAgent(() => {
      instrumentation.observe(
        { type: 'turn_start', turnId: 'turn_1', operationId: 'op_1', conversationId: 'conv_1' },
        {},
      );
    });

    expect(findSpan('invoke_agent Hello')?.data['gen_ai.conversation.id']).toBe('conv_1');
  });

  // The re-entered agent operation carries no `submissionId` and must not open a second span.
  it('does not open a second agent span for the re-entry', async () => {
    await withAgent(() => instrumentation.interceptor(AGENT_OP, INNER_CTX, async () => undefined));

    const agentSpans = endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .filter(json => json.data['sentry.op'] === 'gen_ai.invoke_agent');
    expect(agentSpans).toHaveLength(1);
  });

  // A durable submission is resumed later, with nothing linking it to the request that enqueued it.
  // Flue replays that request's `traceparent`, so the agent span should continue from it.
  describe('trace continuation', () => {
    const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const CARRIER = { traceparent: `00-${TRACE_ID}-bbbbbbbbbbbbbbbb-01` };

    function agentTraceId(): string | undefined {
      return endedSpans.map(span => spanToStaticSpanJSON(span)).find(json => json.description === 'invoke_agent Hello')
        ?.trace_id;
    }

    it('continues the trace from the replayed traceparent', async () => {
      await instrumentation.interceptor(AGENT_OP, { ...AGENT_CTX, traceCarrier: CARRIER }, async () => undefined);

      expect(agentTraceId()).toBe(TRACE_ID);
    });

    it('ignores a malformed traceparent', async () => {
      await instrumentation.interceptor(
        AGENT_OP,
        { ...AGENT_CTX, traceCarrier: { traceparent: 'not-a-traceparent' } },
        async () => undefined,
      );

      expect(agentTraceId()).not.toBe(TRACE_ID);
    });

    // An in-process dispatch is genuinely part of the surrounding trace; continuing the persisted
    // one would detach it from the request it is actually running inside.
    it('keeps the active trace when one is already running', async () => {
      await startSpan({ name: 'incoming request' }, async () => {
        await instrumentation.interceptor(AGENT_OP, { ...AGENT_CTX, traceCarrier: CARRIER }, async () => undefined);
      });

      expect(agentTraceId()).not.toBe(TRACE_ID);
    });
  });

  // The spanned operation carries no `agentName` — only the submission wrapper does, and that opens
  // no span. The name arrives on the observations instead.
  it('names the agent span from the observations', async () => {
    await instrumentation.interceptor(AGENT_OP, {}, async () => {
      instrumentation.observe({ type: 'agent_start', operationId: 'op_1', agentName: 'Hello' }, {});
    });

    const json = findSpan('invoke_agent Hello');
    expect(json).toBeDefined();
    expect(json?.data['gen_ai.agent.name']).toBe('Hello');
  });

  // Delegation nests a second agent operation inside the first, in its own session. Flue defers
  // each to a microtask, so the helper mirrors that rather than calling the interceptor directly.
  describe('subagent delegation', () => {
    function runNested<T>(operationId: string, ctx: Record<string, unknown>, next: () => Promise<T>): Promise<T> {
      return Promise.resolve().then(() => instrumentation.interceptor({ type: 'agent', operationId }, ctx, next));
    }

    it('opens one agent span per invocation rather than folding the delegate into its parent', async () => {
      await runNested('op_parent', {}, async () => {
        instrumentation.observe({ type: 'agent_start', operationId: 'op_parent', conversationId: 'conv_parent' }, {});
        // The tool's task delegation, then the delegate's own prompt.
        return runNested('op_child', {}, async () => {
          instrumentation.observe({ type: 'agent_start', operationId: 'op_child', conversationId: 'conv_child' }, {});
        });
      });

      expect(agentSpans()).toHaveLength(2);
    });

    // Asserted on conversation rather than agent name: the observation stream reports the root
    // agent's name for both operations, so the delegate's own name never reaches us.
    it('keeps each invocation on its own conversation', async () => {
      await runNested('op_parent', {}, async () => {
        instrumentation.observe({ type: 'agent_start', operationId: 'op_parent', conversationId: 'conv_parent' }, {});
        return runNested('op_child', {}, async () => {
          instrumentation.observe({ type: 'agent_start', operationId: 'op_child', conversationId: 'conv_child' }, {});
        });
      });

      // The delegate ends first, so order is inner-to-outer.
      expect(agentSpans().map(json => json.data['gen_ai.conversation.id'])).toEqual(['conv_child', 'conv_parent']);
    });
  });

  it('does not span operations other than `agent`', async () => {
    await instrumentation.interceptor({ type: 'model', turnId: 'turn_1' }, {}, async () => undefined);

    expect(endedSpans).toHaveLength(0);
  });

  // The `model` and `tool` operations open no span of their own; they make the span `observe`
  // already opened active, so the provider's HTTP call and the tool's own work nest inside it
  // rather than landing beside it as siblings of the agent invocation.
  it('makes the turn span active for the model operation it wraps', async () => {
    await withAgent(async () => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
      await instrumentation.interceptor({ type: 'model', turnId: 'turn_1' }, {}, async () => {
        startInactiveSpan({ name: 'provider request' }).end();
      });
      instrumentation.observe(turn(), {});
    });

    expect(findSpan('provider request')?.parent_span_id).toBe(findSpan('chat claude-haiku-4.5')?.span_id);
  });

  it('makes the tool span active for the tool operation it wraps', async () => {
    await withAgent(async () => {
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
      await instrumentation.interceptor({ type: 'tool', toolCallId: 'call_1' }, {}, async () => {
        startInactiveSpan({ name: 'tool work' }).end();
      });
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' }, {});
    });

    expect(findSpan('tool work')?.parent_span_id).toBe(findSpan('execute_tool get_weather')?.span_id);
  });

  it('opens a chat span on turn_start and completes it from the settled turn', async () => {
    await withAgent(() => {
      instrumentation.observe(
        { type: 'turn_start', turnId: 'turn_1', operationId: 'op_1', conversationId: 'conv_1' },
        {},
      );
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
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
      instrumentation.observe(turn(), {});
    });

    const json = findSpan('chat claude-haiku-4.5');
    expect(json?.data['gen_ai.usage.input_tokens']).toBe(924);
    expect(json?.data['gen_ai.usage.output_tokens']).toBe(57);
    expect(json?.data['gen_ai.usage.total_tokens']).toBe(981);
    expect(json?.data['gen_ai.cost.total_tokens']).toBe(0.001199);
  });

  it('records the model-call tuning and provider endpoint', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1', purpose: 'agent' }, {});
      instrumentation.observe(turn(), {});
    });

    const json = findSpan('chat claude-haiku-4.5');
    expect(json?.data['gen_ai.request.temperature']).toBe(0.7);
    expect(json?.data['gen_ai.request.max_tokens']).toBe(1024);
    expect(json?.data['gen_ai.request.reasoning.level']).toBe('high');
    expect(json?.data['server.address']).toBe('api.anthropic.com');
    expect(json?.data['server.port']).toBe(443);
    // Distinguishes a compaction turn from a user-facing one.
    expect(json?.data['flue.turn.purpose']).toBe('agent');
  });

  it('marks a failed turn as errored', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
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
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
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
      await instr.interceptor(AGENT_OP, AGENT_CTX, async () => {
        instr.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
        instr.observe(requestContent, {});
        instr.observe(turn({ response: { ...turn().response, output: { role: 'assistant' } } }), {});
        instr.observe(
          {
            type: 'tool_start',
            toolCallId: 'c1',
            toolName: 'get_weather',
            args: { city: 'Berlin' },
            operationId: 'op_1',
          },
          {},
        );
        instr.observe(
          { type: 'tool', toolCallId: 'c1', toolName: 'get_weather', result: 'sunny', operationId: 'op_1' },
          {},
        );
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

    // The client is replaced per request on Cloudflare, so options captured once at construction
    // would be the wrong ones for every later request.
    it('follows the current client when it is replaced', async () => {
      const instr = createFlueInstrumentation();
      await record(instr);
      expect(findSpan('chat claude-haiku-4.5')?.data['gen_ai.input.messages']).toBeDefined();

      endedSpans.length = 0;
      const strict = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          dataCollection: { genAI: { inputs: false, outputs: false } },
        }),
      );
      setCurrentClient(strict);
      strict.init();
      strict.on('spanEnd', span => endedSpans.push(span));

      await record(instr);

      const chat = findSpan('chat claude-haiku-4.5');
      expect(chat).toBeDefined();
      expect(chat?.data['gen_ai.input.messages']).toBeUndefined();
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
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' }, {});
    });

    const json = findSpan('execute_tool get_weather');
    expect(json?.data['sentry.op']).toBe('gen_ai.execute_tool');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('execute_tool');
    expect(json?.data['gen_ai.tool.name']).toBe('get_weather');
  });

  it('marks a failed tool call as errored', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'call_1', toolName: 'boom', operationId: 'op_1' }, {});
      instrumentation.observe(
        { type: 'tool', toolCallId: 'call_1', toolName: 'boom', isError: true, operationId: 'op_1' },
        {},
      );
    });

    expect(findSpan('execute_tool boom')?.status).toBe('internal_error');
  });

  // Two agent runs overlap on a busy server. With shared closure state the second run is mistaken
  // for a re-entry of the first: it gets no span, and its conversation id lands on the first's span.
  it('keeps concurrent agent runs separate', async () => {
    const runA = instrumentation.interceptor({ type: 'agent', operationId: 'op_a' }, { agentName: 'A' }, async () => {
      instrumentation.observe(
        { type: 'turn_start', turnId: 'turn_a', operationId: 'op_a', conversationId: 'conv_a' },
        {},
      );
      // B starts while A is still open.
      await instrumentation.interceptor({ type: 'agent', operationId: 'op_b' }, { agentName: 'B' }, async () => {
        instrumentation.observe(
          { type: 'turn_start', turnId: 'turn_b', operationId: 'op_b', conversationId: 'conv_b' },
          {},
        );
        instrumentation.observe(turn({ turnId: 'turn_b', operationId: 'op_b' }), {});
      });
      instrumentation.observe(turn({ turnId: 'turn_a', operationId: 'op_a' }), {});
    });
    await runA;

    const agentA = findSpan('invoke_agent A');
    const agentB = findSpan('invoke_agent B');
    expect(agentA).toBeDefined();
    expect(agentB).toBeDefined();

    // Each run keeps its own conversation; neither is overwritten by the other.
    expect(agentA?.data['gen_ai.conversation.id']).toBe('conv_a');
    expect(agentB?.data['gen_ai.conversation.id']).toBe('conv_b');
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
      instrumentation.observe({ type: 'turn_start', turnId: 'turn_1', operationId: 'op_1' }, {});
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
    });
    // Never settled, so the span keeps the unqualified name it opened with.
    expect(findSpan('chat')).toBeUndefined();

    instrumentation.dispose();

    expect(findSpan('chat')).toBeDefined();
    expect(findSpan('execute_tool get_weather')).toBeDefined();
  });
});
