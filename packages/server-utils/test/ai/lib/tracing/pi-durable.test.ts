import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Event, Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  getCurrentScope,
  getMainCarrier,
  setCurrentClient,
  spanToJSON,
  spanToStaticSpanJSON,
  withScope,
} from '@sentry/core';
import { endRunsOnClose, instrumentPiDurableHarnessOptions } from '../../../../src/ai/pi-durable';
import { MAX_TRACKED_PI_RUNS } from '../../../../src/ai/pi-durable/constants';
import { createRuns, startRun } from '../../../../src/ai/pi-durable/runs';
import { instrumentTool, markBuiltInTool } from '../../../../src/ai/pi-durable/tools';
import type {
  PiCommitChange,
  PiEventStream,
  PiHarnessOptions,
  PiLiveState,
  PiModels,
  PiRegistryReader,
  PiSettlement,
  PiTask,
  PiTaskRuntime,
  PiTool,
  PiToolExecutionApi,
  PiToolExecutionResult,
} from '../../../../src/ai/pi-durable/types';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../../../src/ai/anthropic-ai/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../../../../src/ai/google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../../../../src/ai/openai/constants';
import { instrumentWorkersAiClient } from '../../../../src/ai/workers-ai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const LIVE_DOC = { definition: { kind: 'pi.live' } };
const MODEL = { id: 'faux-model', provider: 'faux' };
const ANSWER = { role: 'assistant', content: [{ type: 'text', text: 'Paris.' }], stopReason: 'stop' };

describe('instrumentPiDurableHarnessOptions', () => {
  let endedSpans: Span[];
  let events: Event[];
  let client: TestClient;

  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
    client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();

    endedSpans = [];
    events = [];
    client.on('spanEnd', span => endedSpans.push(span));
    // The root spans of these tests are sent as transaction events; keep only the error events.
    TestClient.sendEventCalled = event => {
      if (event.type !== 'transaction') {
        events.push(event);
      }
    };
  });

  afterEach(() => {
    TestClient.sendEventCalled = undefined;
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('wraps the options once and leaves the caller objects untouched', () => {
    const models = { completeSimple: async () => ({}) };
    const options: PiHarnessOptions = { models };

    const instrumented = instrumentPiDurableHarnessOptions(options);

    expect(instrumented).not.toBe(options);
    expect(instrumented.models).not.toBe(models);
    expect(options.models).toBe(models);
    expect(instrumentPiDurableHarnessOptions(instrumented)).toBe(instrumented);
  });

  // pi-durable reads `settings`, `env` and `conversationCreated` at every use, so getters and later
  // assignments on the caller's options must reach it.
  it('keeps the options the caller changes later live', () => {
    let env = 'first';
    const options = { models: {}, settings: { toolExecution: 'sequential' } } as PiHarnessOptions & {
      settings: unknown;
      env?: string;
    };
    Object.defineProperty(options, 'env', { get: () => env, enumerable: true });

    const instrumented = instrumentPiDurableHarnessOptions(options);
    options.settings = { toolExecution: 'parallel' };
    env = 'second';

    expect(instrumented.settings).toEqual({ toolExecution: 'parallel' });
    expect(instrumented.env).toBe('second');
  });

  it('hands members other than model requests through, bound to the original', () => {
    class Models {
      private _provider = 'faux';
      public getProvider(): string {
        return this._provider;
      }
    }

    const instrumented = instrumentPiDurableHarnessOptions({ models: new Models() as PiModels });

    expect((instrumented.models as unknown as Models).getProvider()).toBe('faux');
    expect(endedSpans).toHaveLength(0);
  });

  it('traces a streamed model request and skips the provider SDK integrations', async () => {
    const message = {
      ...ANSWER,
      model: 'faux-model',
      usage: { input: 10, output: 2, totalTokens: 12 },
    };
    const models: PiModels = { streamSimple: () => ({ result: async () => message }) };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await instrumented.models!.streamSimple!(MODEL, {
      messages: [{ role: 'user', content: 'Capital of France?' }],
    }).result();

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    const chat = spanToStaticSpanJSON(endedSpans[0]!);
    expect(chat.description).toBe('chat faux-model');
    expect(chat.op).toBe('gen_ai.chat');
    expect(chat.data).toMatchObject({
      'gen_ai.provider.name': 'faux',
      'gen_ai.request.model': 'faux-model',
      'gen_ai.response.streaming': true,
      'gen_ai.response.finish_reasons': '["stop"]',
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.output_tokens': 2,
    });
    expect(chat.data['gen_ai.input.messages']).toBe(
      '[{"role":"user","parts":[{"type":"text","content":"Capital of France?"}]}]',
    );
    expect(chat.data['gen_ai.output.messages']).toBe(
      '[{"role":"assistant","parts":[{"type":"text","content":"Paris."}],"finish_reason":"stop"}]',
    );
  });

  it.each([
    ['stream', true],
    ['streamSimple', true],
    ['streamDeferred', true],
    ['complete', false],
    ['completeSimple', false],
    ['fetchDeferred', false],
  ])('traces %s with the request options and the response identity', async (method, streaming) => {
    const message = { ...ANSWER, responseModel: 'faux-model-2026', responseId: 'resp_1' };
    const models = {
      [method]: streaming ? () => ({ result: async () => message }) : async () => message,
    } as PiModels;
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    const result = (instrumented.models as Record<string, (...args: unknown[]) => unknown>)[method]!(
      { ...MODEL, baseUrl: 'https://api.example.com:8443/v1' },
      { messages: [{ role: 'user', content: 'Hi.' }] },
      { temperature: 0.2, maxTokens: 50, reasoning: 'low' },
    );
    await (streaming ? (result as PiEventStream).result() : result);

    const chat = spanToJSON(endedSpans[0]!);
    expect(chat.name).toBe('chat faux-model');
    expect(chat.attributes['gen_ai.response.streaming']).toBe(streaming ? true : undefined);
    expect(chat.attributes['gen_ai.response.model']).toBe('faux-model-2026');
    expect(chat.attributes['gen_ai.response.id']).toBe('resp_1');
    expect(chat.attributes['server.address']).toBe('api.example.com');
    expect(chat.attributes['server.port']).toBe(8443);
    // The deferred methods take a handle, not a request, so there is nothing to record.
    const deferred = method.endsWith('Deferred');
    expect(chat.attributes['gen_ai.request.temperature']).toBe(deferred ? undefined : 0.2);
    expect(chat.attributes['gen_ai.request.max_tokens']).toBe(deferred ? undefined : 50);
    expect(chat.attributes['gen_ai.request.reasoning.level']).toBe(deferred ? undefined : 'low');
    expect(chat.attributes['gen_ai.input.messages']).toBe(
      deferred ? undefined : '[{"role":"user","parts":[{"type":"text","content":"Hi."}]}]',
    );
  });

  it('sets the conversation id of the scope on the chat span itself', async () => {
    const models: PiModels = { completeSimple: async () => ANSWER };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await withScope(async scope => {
      scope.setConversationId('harness:7');
      await instrumented.models!.completeSimple!(MODEL, { messages: [] });
    });

    expect(spanToJSON(endedSpans[0]!).attributes['gen_ai.conversation.id']).toBe('harness:7');
  });

  it('counts the cached tokens of a response into its input tokens', async () => {
    const message = {
      ...ANSWER,
      usage: { input: 37, output: 2, cacheRead: 52, cacheWrite: 38, reasoning: 1, totalTokens: 129 },
    };
    const models: PiModels = { completeSimple: async () => message };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await instrumented.models!.completeSimple!(MODEL, { messages: [] });

    expect(spanToJSON(endedSpans[0]!).attributes).toMatchObject({
      'gen_ai.usage.input_tokens': 127,
      'gen_ai.usage.cache_read.input_tokens': 52,
      'gen_ai.usage.cache_creation.input_tokens': 38,
      'gen_ai.usage.reasoning.output_tokens': 1,
      'gen_ai.usage.total_tokens': 129,
    });
  });

  // The provider parks the request and pi-durable fetches the answer later: only the fetch is billed.
  it('records no usage for a request the provider parked, and the usage of its answer', async () => {
    const parked = {
      role: 'assistant',
      content: [],
      stopReason: 'deferred',
      usage: { input: 0, output: 0, totalTokens: 0 },
    };
    const answer = { ...ANSWER, usage: { input: 8, output: 2, totalTokens: 10 } };
    const models: PiModels = { completeSimple: async () => parked, fetchDeferred: async () => answer };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await instrumented.models!.completeSimple!(MODEL, { messages: [] });
    await instrumented.models!.fetchDeferred!(MODEL, { id: 'handle_1' });

    const [parkedChat, answerChat] = endedSpans.map(span => spanToJSON(span).attributes);
    expect(parkedChat!['gen_ai.response.finish_reasons']).toBe('["deferred"]');
    expect(parkedChat!['gen_ai.usage.total_tokens']).toBeUndefined();
    expect(answerChat!['gen_ai.usage.total_tokens']).toBe(10);
  });

  it('marks a failed request with a fixed status message and maps a tool-calling stop', async () => {
    const failed = {
      role: 'assistant',
      content: [],
      stopReason: 'error',
      errorMessage: '401 invalid x-api-key for user@example.com',
      usage: { input: 0, output: 0, totalTokens: 0 },
    };
    const toolCall = {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.txt' } }],
      stopReason: 'toolUse',
    };
    const models: PiModels = { completeSimple: async () => failed, complete: async () => toolCall };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await instrumented.models!.completeSimple!(MODEL, { messages: [] });
    await instrumented.models!.complete!(MODEL, { messages: [] });

    const [chatFailed, chatToolCall] = endedSpans.map(span => spanToJSON(span));
    expect(chatFailed!.status).toBe('error');
    expect(chatFailed!.attributes['sentry.status.message']).toBe('internal_error');
    expect(JSON.stringify(chatFailed!.attributes)).not.toContain('x-api-key');
    expect(chatFailed!.attributes['gen_ai.usage.total_tokens']).toBeUndefined();
    expect(chatToolCall!.attributes['gen_ai.response.finish_reasons']).toBe('["tool_call"]');
    expect(chatToolCall!.attributes['gen_ai.output.messages']).toContain('"finish_reason":"tool_call"');
  });

  it('marks a rejected or throwing request as errored and keeps the error', async () => {
    const models: PiModels = {
      completeSimple: async () => {
        throw new Error('boom');
      },
      stream: () => {
        throw new Error('sync boom');
      },
    };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    await expect(instrumented.models!.completeSimple!(MODEL, { messages: [] })).rejects.toThrow('boom');
    expect(() => instrumented.models!.stream!(MODEL, { messages: [] })).toThrow('sync boom');

    expect(endedSpans.map(span => spanToJSON(span).attributes['sentry.status.message'])).toEqual([
      'internal_error',
      'internal_error',
    ]);
  });

  it('reads the system prompt and the tools from the positional system messages', async () => {
    const models: PiModels = {
      streamSimple: () => ({ result: async () => ({ role: 'assistant', content: [], stopReason: 'stop' }) }),
    };
    const instrumented = instrumentPiDurableHarnessOptions({ models });

    // pi-durable never sets `systemPrompt` or `tools`: it sends prompt sections and tool changes as
    // system messages, and each request replays them.
    await instrumented.models!.streamSimple!(MODEL, {
      messages: [
        {
          role: 'system',
          content: '',
          sections: { preamble: 'You help.' },
          toolsAdded: [{ name: 'read' }, { name: 'bash' }],
        },
        { role: 'user', content: 'Hi.' },
        { role: 'system', content: '', sections: { mode: 'Plan only.' }, toolsRemoved: [{ name: 'bash' }] },
      ],
    }).result();

    const chat = spanToStaticSpanJSON(endedSpans[0]!);
    expect(chat.data['gen_ai.system_instructions']).toBe('You help.\n\nPlan only.');
    expect(chat.data['gen_ai.tool.definitions']).toBe('[{"name":"read"}]');
    expect(chat.data['gen_ai.input.messages']).toBe('[{"role":"user","parts":[{"type":"text","content":"Hi."}]}]');
  });

  describe('provider skip', () => {
    const models: PiModels = { completeSimple: async () => ANSWER };

    it('skips the provider integrations on the first request, not when the options are wrapped', async () => {
      const instrumented = instrumentPiDurableHarnessOptions({ models });
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

      await instrumented.models!.completeSimple!(MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(true);
    });

    // The registry is reset per client, so a one-shot call would be undone by the next `init()`.
    it('applies the skip again after the registry is cleared', async () => {
      const instrumented = instrumentPiDurableHarnessOptions({ models });
      await instrumented.models!.completeSimple!(MODEL, { messages: [] });
      _INTERNAL_clearAiProviderSkips();
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

      await instrumented.models!.completeSimple!(MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    });

    it('applies the skip to every provider when only some are already registered', async () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      const instrumented = instrumentPiDurableHarnessOptions({ models });

      await instrumented.models!.completeSimple!(MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(true);
    });

    // `createAI()` of `agents/models/pi-ai` sends pi-ai requests through the Workers AI binding.
    it('reports a request sent through the Workers AI binding once', async () => {
      const ai = instrumentWorkersAiClient({
        run: async (_model: string, _inputs: unknown, _options: unknown) => new Response('{}'),
        gateway: () => ({}),
        toMarkdown: async () => [],
      });
      const models: PiModels = {
        completeSimple: async () => {
          await ai.run('@cf/moonshotai/kimi-k2.7-code', { messages: [] }, { returnRawResponse: true });
          return ANSWER;
        },
      };
      const instrumented = instrumentPiDurableHarnessOptions({ models });

      await instrumented.models!.completeSimple!(MODEL, { messages: [] });

      expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['chat faux-model']);
    });
  });

  describe('content recording', () => {
    const tool: PiTool = {
      name: 'get_weather',
      description: 'Get the weather.',
      execute: async () => ({ content: [{ type: 'text', text: 'sunny' }] }),
    };
    const message = {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call_1', name: 'get_weather', arguments: { city: 'Berlin' } }],
      stopReason: 'toolUse',
    };
    const context = {
      messages: [
        { role: 'system', content: '', sections: { preamble: 'You help.' }, toolsAdded: [{ name: 'get_weather' }] },
        { role: 'user', content: 'Weather in Berlin?' },
      ],
    };

    it('records nothing when inputs and outputs are off', async () => {
      const options = { recordInputs: false, recordOutputs: false };
      const instrumented = instrumentPiDurableHarnessOptions(
        { models: { completeSimple: async () => message } as PiModels },
        options,
      );

      await instrumented.models!.completeSimple!(MODEL, context);
      await instrumentTool(tool, createRuns(), options).execute({ city: 'Berlin' }, { callId: 'call_1' }, undefined);

      const [chat, execute] = endedSpans.map(span => spanToJSON(span).attributes);
      expect(Object.keys(chat!)).not.toContain('gen_ai.input.messages');
      expect(Object.keys(chat!)).not.toContain('gen_ai.output.messages');
      expect(Object.keys(chat!)).not.toContain('gen_ai.system_instructions');
      expect(Object.keys(chat!)).not.toContain('gen_ai.tool.definitions');
      expect(Object.keys(execute!)).not.toContain('gen_ai.tool.call.arguments');
      expect(Object.keys(execute!)).not.toContain('gen_ai.tool.call.result');
      expect(execute!['gen_ai.tool.description']).toBe('Get the weather.');
    });

    it('follows the data collection settings of the current client', async () => {
      const strict = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
          dataCollection: { genAI: { inputs: false, outputs: false } },
        }),
      );
      setCurrentClient(strict);
      strict.init();
      strict.on('spanEnd', span => endedSpans.push(span));
      const models: PiModels = { completeSimple: async () => message };
      const instrumented = instrumentPiDurableHarnessOptions({ models });

      await instrumented.models!.completeSimple!(MODEL, context);
      await instrumentTool(tool, createRuns(), {}).execute({ city: 'Berlin' }, { callId: 'call_1' }, undefined);

      const recorded = endedSpans.flatMap(span => Object.keys(spanToJSON(span).attributes));
      expect(recorded).not.toContain('gen_ai.input.messages');
      expect(recorded).not.toContain('gen_ai.output.messages');
      expect(recorded).not.toContain('gen_ai.system_instructions');
      expect(recorded).not.toContain('gen_ai.tool.definitions');
      expect(recorded).not.toContain('gen_ai.tool.call.arguments');
      expect(recorded).not.toContain('gen_ai.tool.call.result');
    });
  });

  it('captures the failures pi-durable reports and still hands them to the caller', async () => {
    const reported: unknown[] = [];
    const options: PiHarnessOptions = {};
    const instrumented = instrumentPiDurableHarnessOptions(options);
    options.onReport = error => reported.push(error);
    const error = new Error('afterResponse hook failed');

    instrumented.onReport!(error);
    await client.flush();

    expect(reported).toEqual([error]);
    expect(client.event?.exception?.values?.[0]?.value).toBe('afterResponse hook failed');
    expect(client.event?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: true });
  });

  it('returns the same wrapped task for the same definition in every snapshot', () => {
    const generation: PiTask = { definition: { name: 'pi.generation', phases: { prepare: async () => undefined } } };
    const registry: PiRegistryReader = {
      // A new snapshot object per call, as pi-durable publishes one per registry change.
      snapshot: () => ({ task: () => generation, tasks: () => [generation] }),
      subscribe: () => () => undefined,
    };

    const instrumented = instrumentPiDurableHarnessOptions({ registry }).registry!;

    const first = instrumented.snapshot().task('pi.generation');
    expect(first).not.toBe(generation);
    expect(instrumented.snapshot().task('pi.generation')).toBe(first);
    expect(instrumented.snapshot().tasks()[0]).toBe(first);
  });

  // pi-durable calls a phase on the `phases` object and `abort` on the definition.
  it('calls task phases and abort handlers with their own receiver', async () => {
    const definition = {
      name: 'app.job',
      phases: {
        run(this: { helper(): Promise<string> }) {
          return this.helper();
        },
        helper: async () => 'helped',
      },
      abort(this: { name: string }) {
        return Promise.resolve(this.name);
      },
    };
    const task = { definition } as unknown as PiTask;
    const registry: PiRegistryReader = {
      snapshot: () => ({ task: () => task, tasks: () => [task] }),
      subscribe: () => () => undefined,
    };
    const runtime: PiTaskRuntime = {
      taskId: 1,
      conversationId: 1,
      agent: async () => ({}),
      commit: async () => undefined,
    };

    const wrapped = instrumentPiDurableHarnessOptions({ registry }).registry!.snapshot().task('app.job')!;

    await expect(wrapped.definition.phases.run!(undefined, runtime, undefined)).resolves.toBe('helped');
    await expect(wrapped.definition.abort!(undefined, runtime, undefined)).resolves.toBe('app.job');
  });

  describe('tools', () => {
    it('runs a frozen tool and a tool that reads a private field', async () => {
      const frozen: PiTool = Object.freeze({
        name: 'frozen',
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });
      class PrefixTool {
        #prefix = 'pre';
        public name = 'prefixed';
        public prepareArguments(args: string): string {
          return `${this.#prefix}:${args}`;
        }
        public async execute(): Promise<PiToolExecutionResult> {
          return { content: [{ type: 'text', text: this.#prefix }] };
        }
      }
      const runs = createRuns();

      const wrappedFrozen = instrumentTool(frozen, runs, {});
      const wrappedPrefix = instrumentTool(new PrefixTool() as unknown as PiTool, runs, {});

      expect(wrappedFrozen.name).toBe('frozen');
      await expect(wrappedFrozen.execute({}, {}, undefined)).resolves.toEqual({
        content: [{ type: 'text', text: 'ok' }],
      });
      expect((wrappedPrefix as unknown as PrefixTool).prepareArguments('x')).toBe('pre:x');
      await expect(wrappedPrefix.execute({}, {}, undefined)).resolves.toEqual({
        content: [{ type: 'text', text: 'pre' }],
      });
      expect(endedSpans.map(span => spanToJSON(span).name)).toEqual(['execute_tool frozen', 'execute_tool prefixed']);
    });

    it('ends a call outside a tool phase with its own result', async () => {
      const runs = createRuns();
      const tool: PiTool = {
        name: 'get_weather',
        description: 'Get the weather.',
        execute: async () => ({ content: [{ type: 'text', text: 'sunny' }] }),
      };

      await instrumentTool(tool, runs, {}).execute(
        { city: 'Berlin' },
        { callId: 'call_1', conversationId: 4 },
        undefined,
      );

      const execute = spanToJSON(endedSpans[0]!);
      expect(execute.name).toBe('execute_tool get_weather');
      expect(execute.status).toBe('ok');
      expect(execute.attributes).toMatchObject({
        'sentry.op': 'gen_ai.execute_tool',
        'sentry.origin': 'auto.ai.pi_durable',
        'gen_ai.tool.name': 'get_weather',
        'gen_ai.tool.description': 'Get the weather.',
        'gen_ai.tool.call.id': 'call_1',
        'gen_ai.conversation.id': `${runs.harnessId}:4`,
        'gen_ai.tool.call.arguments': '{"city":"Berlin"}',
        'gen_ai.tool.call.result': 'sunny',
      });
    });

    it.each([
      ['no content blocks', []],
      ['an empty text block', [{ type: 'text', text: '' }]],
    ])('records an empty tool result given as %s', async (_label, content) => {
      const tool: PiTool = { name: 'clear_cache', execute: async () => ({ content }) };

      await instrumentTool(tool, createRuns(), {}).execute({}, { callId: 'call_1' }, undefined);

      expect(spanToJSON(endedSpans[0]!).attributes['gen_ai.tool.call.result']).toBe('');
    });

    it('marks error results and throws, and captures a throw unless the tool is built in', async () => {
      const runs = createRuns();
      const erroring: PiTool = {
        name: 'erroring',
        execute: async () => ({ isError: true, content: [{ type: 'text', text: 'not found' }] }),
      };
      const throwing: PiTool = {
        name: 'throwing',
        execute: async () => {
          throw new Error('tool failed');
        },
      };
      const builtIn: PiTool = {
        name: 'bash',
        execute: async () => {
          throw new Error('Command exited with code 1');
        },
      };
      markBuiltInTool(builtIn);

      await instrumentTool(erroring, runs, {}).execute({}, {}, undefined);
      await expect(instrumentTool(throwing, runs, {}).execute({}, {}, undefined)).rejects.toThrow('tool failed');
      await expect(instrumentTool(builtIn, runs, {}).execute({}, {}, undefined)).rejects.toThrow('code 1');
      await client.flush();

      const [errored, thrown, bash] = endedSpans.map(span => spanToJSON(span));
      expect(errored!.attributes['sentry.status.message']).toBe('internal_error');
      expect(errored!.attributes['gen_ai.tool.call.result']).toBe('not found');
      expect(thrown!.attributes['sentry.status.message']).toBe('internal_error');
      expect(bash!.attributes['sentry.status.message']).toBe('internal_error');
      expect(events.map(event => event.exception?.values?.[0]?.value)).toEqual(['tool failed']);
      expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: true });
    });

    it('marks an aborted call as cancelled and captures nothing', async () => {
      const controller = new AbortController();
      const tool: PiTool = {
        name: 'slow',
        execute: async () => {
          controller.abort();
          throw new Error('tool aborted');
        },
      };

      await expect(
        instrumentTool(tool, createRuns(), {}).execute({}, {}, { abortSignal: controller.signal }),
      ).rejects.toThrow('tool aborted');
      await client.flush();

      expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('cancelled');
      expect(events).toHaveLength(0);
    });

    it('ends a nested tool call with its own result and links a forked conversation to the call', async () => {
      const runs = createRuns();
      runs.toolCalls.set(7, []);
      const inner = instrumentTool(
        { name: 'inner', execute: async () => ({ content: [{ type: 'text', text: 'INNER' }] }) },
        runs,
        {},
      );
      const outer = instrumentTool(
        {
          name: 'outer',
          execute: async (_args, api) => {
            await inner.execute({}, api, undefined);
            await api.commit!(
              tx =>
                (tx as { forkConversation: (...args: unknown[]) => unknown }).forkConversation(1, 3, {
                  ownership: { kind: 'task', taskId: 7 },
                }),
              undefined,
            );
            return { content: [{ type: 'text', text: 'OUTER' }] };
          },
        },
        runs,
        {},
      );
      const api: PiToolExecutionApi = {
        taskId: 7,
        callId: 'call_1',
        commit: async change => change({ forkConversation: async () => ({ id: 42 }) }),
      };

      await outer.execute({}, api, undefined);

      expect(endedSpans.map(span => spanToJSON(span).name)).toEqual(['execute_tool inner']);
      expect(spanToJSON(endedSpans[0]!).attributes['gen_ai.tool.call.result']).toBe('INNER');
      // The outer call waits for the result entry its phase commits.
      const [outerCall] = runs.toolCalls.get(7)!;
      expect(outerCall!.span.spanContext().spanId).toBe(spanToJSON(endedSpans[0]!).parent_span_id);
      expect(spanToJSON(startRun(42, runs).span).parent_span_id).toBe(outerCall!.span.spanContext().spanId);
    });
  });

  describe('runs', () => {
    /** A generation phase that commits each of `states` as the `pi.live` document, in order. */
    function generationPhase(states: (PiLiveState | { settle: PiSettlement })[]): PiTask {
      return {
        definition: {
          name: 'pi.generation',
          phases: {
            request: async (_task, runtime) => {
              for (const state of states) {
                await runtime.commit(async tx => {
                  const draft = (await (tx as { doc: (...args: unknown[]) => Promise<PiLiveState> }).doc(LIVE_DOC, 1))!;
                  if ('settle' in state) {
                    (tx as { settleSubmission: (...args: unknown[]) => void }).settleSubmission(5, state.settle);
                    delete draft.run;
                  } else {
                    draft.run = state.run;
                  }
                  return undefined;
                }, undefined);
              }
            },
          },
        },
      };
    }

    function harnessFor(task: PiTask): PiHarnessOptions {
      const registry: PiRegistryReader = {
        snapshot: () => ({ task: () => task, tasks: () => [task] }),
        subscribe: () => () => undefined,
      };
      return instrumentPiDurableHarnessOptions({ registry });
    }

    async function runGeneration(harness: PiHarnessOptions): Promise<void> {
      const live: PiLiveState = {};
      const tx = { doc: async () => live, settleSubmission: () => undefined };
      const runtime: PiTaskRuntime = {
        taskId: 3,
        conversationId: 1,
        agent: async () => ({}),
        commit: async (change: PiCommitChange) => {
          await change(tx, undefined);
        },
      };
      await harness.registry!.snapshot().task('pi.generation')!.definition.phases.request!(
        undefined,
        runtime,
        undefined,
      );
    }

    function runSpans(): ReturnType<typeof spanToJSON>[] {
      return endedSpans
        .map(span => spanToJSON(span))
        .filter(span => span.attributes['sentry.op'] === 'gen_ai.invoke_agent');
    }

    it('keeps the run open while run control moves to the next generation', async () => {
      await runGeneration(harnessFor(generationPhase([{ run: { inputs: [5] } }, { run: { inputs: [5, 6] } }])));

      expect(runSpans()).toHaveLength(0);
    });

    it.each([
      ['model_error', 'error', 'model_error'],
      ['no_model', 'error', 'no_model'],
      ['aborted', 'ok', undefined],
      ['reset', 'ok', undefined],
      [undefined, 'error', 'internal_error'],
    ])('ends an unanswered run with reason %s as %s', async (reason, status, message) => {
      await runGeneration(
        harnessFor(generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'unanswered', reason } }])),
      );

      const runs = runSpans();
      expect(runs).toHaveLength(1);
      expect(runs[0]!.status).toBe(status);
      expect(runs[0]!.attributes['sentry.status.message']).toBe(message);
      expect(runs[0]!.attributes['gen_ai.conversation.id']).toMatch(/^[0-9a-f]{32}:1$/);
    });

    // `@sentry/cloudflare` initializes the SDK inside each request, so the client is bound to the
    // scope of that request and never to the default scope.
    it('traces a run when only the scope that starts the phase has the client', async () => {
      getCurrentScope().setClient(undefined);
      const harness = harnessFor(generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'done' } }]));

      await withScope(async scope => {
        scope.setClient(client);
        await runGeneration(harness);
      });

      expect(runSpans()).toHaveLength(1);
    });

    it('ends the run when a queued input starts the next run in the same commit', async () => {
      await runGeneration(harnessFor(generationPhase([{ run: { inputs: [5] } }, { run: { inputs: [7] } }])));

      const runs = runSpans();
      expect(runs).toHaveLength(1);
      expect(runs[0]!.status).toBe('ok');
    });

    it('gives every Harness its own conversation id prefix', async () => {
      const phase = generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'done' } }]);
      const first = harnessFor(phase);

      await runGeneration(first);
      await runGeneration(first);
      await runGeneration(harnessFor(phase));

      const ids = runSpans().map(run => String(run.attributes['gen_ai.conversation.id']));
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[2]).not.toBe(ids[0]);
      expect(ids.every(id => id.endsWith(':1'))).toBe(true);
    });

    it('ends the open runs when the Harness closes', async () => {
      const harness = harnessFor(generationPhase([{ run: { inputs: [5] } }]));
      let onClose: (() => void) | undefined;
      endRunsOnClose(harness, { subscribeClose: (listener: () => void) => ((onClose = listener), () => undefined) });

      await runGeneration(harness);
      expect(runSpans()).toHaveLength(0);

      onClose!();

      expect(runSpans()).toHaveLength(1);
      expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('cancelled');
    });

    // `wait()` resolves once the ending commit settles the inputs, before `commit()` resolves, so an
    // app that closes right after `wait()` closes inside that gap.
    it('ends a run with its own settlement when the Harness closes before the ending commit resolves', async () => {
      const harness = harnessFor(
        generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'unanswered', reason: 'model_error' } }]),
      );
      let onClose: (() => void) | undefined;
      endRunsOnClose(harness, { subscribeClose: (listener: () => void) => ((onClose = listener), () => undefined) });
      const live: PiLiveState = {};
      const tx = { doc: async () => live, settleSubmission: () => undefined };
      let commits = 0;
      const runtime: PiTaskRuntime = {
        taskId: 3,
        conversationId: 1,
        agent: async () => ({}),
        commit: async (change: PiCommitChange) => {
          await change(tx, undefined);
          commits++;
          if (commits === 2) {
            onClose!();
          }
        },
      };

      await harness.registry!.snapshot().task('pi.generation')!.definition.phases.request!(
        undefined,
        runtime,
        undefined,
      );

      const runs = runSpans();
      expect(runs).toHaveLength(1);
      expect(runs[0]!.status).toBe('error');
      expect(runs[0]!.attributes['sentry.status.message']).toBe('model_error');
    });

    // A run the process never sees settle would otherwise stay in the map for the process lifetime.
    it('ends the oldest run span when the run tracker overflows', () => {
      const runs = createRuns();

      for (let conversation = 0; conversation <= MAX_TRACKED_PI_RUNS; conversation++) {
        startRun(conversation, runs);
      }

      expect(runs.active.size).toBe(MAX_TRACKED_PI_RUNS);
      expect(runs.active.has(0)).toBe(false);
      expect(endedSpans).toHaveLength(1);
      expect(spanToJSON(endedSpans[0]!).attributes['gen_ai.conversation.id']).toBe(`${runs.harnessId}:0`);
    });
  });
});
