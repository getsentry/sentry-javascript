import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Event, Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  getCurrentScope,
  getMainCarrier,
  getRootSpan,
  setCurrentClient,
  spanToJSON,
  spanToStaticSpanJSON,
  withScope,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_REASONING_LEVEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_STATUS_MESSAGE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../src/ai/core/gen-ai-attributes';
import { endRunsOnClose, instrumentPiDurableHarnessOptions } from '../../../../src/ai/pi-durable';
import { startPiAiChatSpan } from '../../../../src/ai/pi-ai/chat';
import { MAX_TRACKED_PI_RUNS } from '../../../../src/ai/pi-durable/constants';
import type { PiRuns } from '../../../../src/ai/pi-durable/runs';
import { createRuns, startRun } from '../../../../src/ai/pi-durable/runs';
import { instrumentTool, markBuiltInTool } from '../../../../src/ai/pi-durable/tools';
import type {
  PiCommitChange,
  PiHarnessOptions,
  PiLiveState,
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

// What `piAiIntegration` does for each model request pi-durable sends through pi-ai.
function sendModelRequest(): void {
  startPiAiChatSpan(
    [{ id: 'faux-model', provider: 'faux' }, { messages: [] }],
    { streaming: false, deferred: false },
    {},
  ).end();
}

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
    const registry: PiRegistryReader = {
      snapshot: () => ({ task: () => undefined, tasks: () => [] }),
      subscribe: () => () => undefined,
    };
    const options: PiHarnessOptions = { registry };

    const instrumented = instrumentPiDurableHarnessOptions(options);

    expect(instrumented).not.toBe(options);
    expect(instrumented.registry).not.toBe(registry);
    expect(options.registry).toBe(registry);
    expect(instrumentPiDurableHarnessOptions(instrumented)).toBe(instrumented);
  });

  // pi-durable reads `settings`, `env` and `conversationCreated` at every use, so getters and later
  // assignments on the caller's options must reach it.
  it('keeps the options the caller changes later live', () => {
    let env = 'first';
    const options = { settings: { toolExecution: 'sequential' } } as PiHarnessOptions & {
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

  describe('content recording', () => {
    const tool: PiTool = {
      name: 'get_weather',
      description: 'Get the weather.',
      execute: async () => ({ content: [{ type: 'text', text: 'sunny' }] }),
    };
    it('records nothing when inputs and outputs are off', async () => {
      const options = { recordInputs: false, recordOutputs: false };

      await instrumentTool(tool, createRuns(), options).execute({ city: 'Berlin' }, { callId: 'call_1' }, undefined);

      const [execute] = endedSpans.map(span => spanToJSON(span).attributes);
      expect(Object.keys(execute!)).not.toContain(GEN_AI_TOOL_CALL_ARGUMENTS);
      expect(Object.keys(execute!)).not.toContain(GEN_AI_TOOL_CALL_RESULT);
      expect(execute![GEN_AI_TOOL_DESCRIPTION]).toBe('Get the weather.');
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

      await instrumentTool(tool, createRuns(), {}).execute({ city: 'Berlin' }, { callId: 'call_1' }, undefined);

      const recorded = endedSpans.flatMap(span => Object.keys(spanToJSON(span).attributes));
      expect(recorded).not.toContain(GEN_AI_TOOL_CALL_ARGUMENTS);
      expect(recorded).not.toContain(GEN_AI_TOOL_CALL_RESULT);
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

  it('reports the failures as unhandled when the app passed no onReport', async () => {
    const options: PiHarnessOptions = {};
    const instrumented = instrumentPiDurableHarnessOptions(options);

    instrumented.onReport!(new Error('section render failed'));
    await client.flush();

    expect(client.event?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
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
        [SENTRY_OP]: GEN_AI_EXECUTE_TOOL,
        [SENTRY_ORIGIN]: 'auto.ai.pi_durable',
        [GEN_AI_TOOL_NAME]: 'get_weather',
        [GEN_AI_TOOL_DESCRIPTION]: 'Get the weather.',
        [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'call_1',
        [GEN_AI_CONVERSATION_ID]: `${runs.harnessId}:4`,
        [GEN_AI_TOOL_CALL_ARGUMENTS]: '{"city":"Berlin"}',
        [GEN_AI_TOOL_CALL_RESULT]: 'sunny',
      });
    });

    it('reads the result of a call outside a tool phase from `output`', async () => {
      const tool: PiTool = {
        name: 'get_weather',
        execute: async () => ({ output: [{ type: 'text', text: 'sunny' }] }),
      };

      await instrumentTool(tool, createRuns(), {}).execute({}, { callId: 'call_1' }, undefined);

      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_TOOL_CALL_RESULT]).toBe('sunny');
    });

    it.each([
      ['no content blocks', []],
      ['an empty text block', [{ type: 'text', text: '' }]],
    ])('records an empty tool result given as %s', async (_label, content) => {
      const tool: PiTool = { name: 'clear_cache', execute: async () => ({ content }) };

      await instrumentTool(tool, createRuns(), {}).execute({}, { callId: 'call_1' }, undefined);

      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_TOOL_CALL_RESULT]).toBe('');
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
      expect(errored!.attributes[SENTRY_STATUS_MESSAGE]).toBe('internal_error');
      expect(errored!.attributes[GEN_AI_TOOL_CALL_RESULT]).toBe('not found');
      expect(thrown!.attributes[SENTRY_STATUS_MESSAGE]).toBe('internal_error');
      expect(bash!.attributes[SENTRY_STATUS_MESSAGE]).toBe('internal_error');
      expect(events.map(event => event.exception?.values?.[0]?.value)).toEqual(['tool failed']);
      expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
    });

    it('links a conversation to the failed tool call that created it', async () => {
      const runs = createRuns();
      const tool = instrumentTool(
        {
          name: 'delegate',
          execute: async (_args, api) => {
            await api.commit!(
              tx =>
                (tx as { createConversation: (...args: unknown[]) => unknown }).createConversation({
                  ownership: { kind: 'task', taskId: 7 },
                }),
              undefined,
            );
            throw new Error('delegation failed');
          },
        },
        runs,
        {},
      );
      const api: PiToolExecutionApi = {
        taskId: 7,
        callId: 'call_1',
        commit: async change => change({ createConversation: async () => ({ id: 42 }) }),
      };

      await expect(tool.execute({}, api, undefined)).rejects.toThrow('delegation failed');

      const call = spanToJSON(endedSpans[0]!);
      expect(spanToJSON(startRun(42, runs).span)).toMatchObject({
        trace_id: call.trace_id,
        parent_span_id: call.span_id,
      });
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
      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_TOOL_CALL_RESULT]).toBe('INNER');
      // The outer call waits for the result entry its phase commits.
      const [outerCall] = runs.toolCalls.get(7)!;
      expect(outerCall!.span.spanContext().spanId).toBe(spanToJSON(endedSpans[0]!).parent_span_id);
      expect(spanToJSON(startRun(42, runs).span).parent_span_id).toBe(outerCall!.span.spanContext().spanId);
    });

    it('starts the first run of a conversation as a root once the trace of the call that created it has ended', async () => {
      const runs = createRuns();
      const tool = instrumentTool(
        {
          name: 'delegate',
          execute: async (_args, api) => {
            await api.commit!(
              tx =>
                (tx as { createConversation: (...args: unknown[]) => unknown }).createConversation({
                  ownership: { kind: 'task', taskId: 7 },
                }),
              undefined,
            );
            return { content: [{ type: 'text', text: 'Subagent created.' }] };
          },
        },
        runs,
        {},
      );
      const api: PiToolExecutionApi = {
        taskId: 7,
        callId: 'call_1',
        commit: async change => change({ createConversation: async () => ({ id: 42 }) }),
      };
      await tool.execute({}, api, undefined);

      const run = startRun(42, runs).span;

      const call = spanToJSON(endedSpans[0]!);
      expect(spanToJSON(run)).toMatchObject({ trace_id: call.trace_id, parent_span_id: call.span_id });
      expect(getRootSpan(run)).toBe(run);
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
        .filter(span => span.attributes[SENTRY_OP] === GEN_AI_INVOKE_AGENT);
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
      expect(runs[0]!.attributes[SENTRY_STATUS_MESSAGE]).toBe(message);
      expect(runs[0]!.attributes[GEN_AI_CONVERSATION_ID]).toMatch(/^[0-9a-f]{32}:1$/);
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

    it('starts no run for an abort handler whose task has no run', async () => {
      const task: PiTask = {
        definition: {
          name: 'pi.generation',
          phases: {},
          abort: async (_task, runtime) =>
            runtime.commit(async tx => {
              await (tx as { doc: (...args: unknown[]) => Promise<PiLiveState> }).doc(LIVE_DOC, 1);
              return undefined;
            }, undefined),
        },
      };
      const harness = harnessFor(task);
      const runtime: PiTaskRuntime = {
        taskId: 3,
        conversationId: 1,
        agent: async () => ({}),
        commit: async (change: PiCommitChange) => {
          await change({ doc: async () => ({}) }, undefined);
        },
      };

      await harness.registry!.snapshot().task('pi.generation')!.definition.abort!(undefined, runtime, undefined);

      expect(runSpans()).toEqual([]);
      expect((harness as unknown as Record<symbol, PiRuns>)[Symbol.for('sentry.pi-durable.runs')]!.active.size).toBe(0);
    });

    it('gives every Harness its own conversation id prefix', async () => {
      const phase = generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'done' } }]);
      const first = harnessFor(phase);

      await runGeneration(first);
      await runGeneration(first);
      await runGeneration(harnessFor(phase));

      const ids = runSpans().map(run => String(run.attributes[GEN_AI_CONVERSATION_ID]));
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[2]).not.toBe(ids[0]);
      expect(ids.every(id => id.endsWith(':1'))).toBe(true);
    });

    it('uses the provider session id of the conversation, also in a new Harness', async () => {
      const sessionId = '019a2b3c-4d5e-7f60-8172-93a4b5c6d7e8';
      const harnessWithModels = (): PiHarnessOptions => {
        const settle = generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'done' } }]);
        const task: PiTask = {
          definition: {
            name: 'pi.generation',
            phases: {
              request: async (taskRecord, runtime, context) => {
                sendModelRequest();
                await settle.definition.phases.request!(taskRecord, runtime, context);
              },
            },
          },
        };
        const harness: PiHarnessOptions = instrumentPiDurableHarnessOptions({
          registry: {
            snapshot: () => ({ task: () => task, tasks: () => [task] }),
            subscribe: () => () => undefined,
          },
        });
        return harness;
      };
      const runGenerationWithProviderDoc = async (harness: PiHarnessOptions): Promise<void> => {
        const live: PiLiveState = {};
        const runtime: PiTaskRuntime = {
          taskId: 3,
          conversationId: 1,
          agent: async () => ({}),
          commit: async (change: PiCommitChange) => {
            await change({ doc: async () => live, settleSubmission: () => undefined }, undefined);
          },
          // pi-durable rejects a read whose definition disagrees with the stored document.
          snapshot: async (token, ownerId) => {
            expect(token.definition).toEqual({
              kind: 'pi.provider',
              version: 1,
              scope: 'conversation',
              history: 'latest',
              fork: 'initial',
            });
            return ownerId === 1 ? { sessionId } : undefined;
          },
        };
        await harness.registry!.snapshot().task('pi.generation')!.definition.phases.request!(
          undefined,
          runtime,
          undefined,
        );
      };

      await runGenerationWithProviderDoc(harnessWithModels());
      await runGenerationWithProviderDoc(harnessWithModels());

      const ids = endedSpans
        .map(span => spanToJSON(span))
        .filter(
          span => span.attributes[SENTRY_OP] === GEN_AI_INVOKE_AGENT || span.attributes[SENTRY_OP] === GEN_AI_CHAT,
        )
        .map(span => span.attributes[GEN_AI_CONVERSATION_ID]);
      expect(ids).toEqual([sessionId, sessionId, sessionId, sessionId]);
    });

    it('keeps the harness prefix when the provider session id cannot be read', async () => {
      const harness = harnessFor(generationPhase([{ run: { inputs: [5] } }, { settle: { status: 'done' } }]));
      const live: PiLiveState = {};
      const runtime: PiTaskRuntime = {
        taskId: 3,
        conversationId: 1,
        agent: async () => ({}),
        commit: async (change: PiCommitChange) => {
          await change({ doc: async () => live, settleSubmission: () => undefined }, undefined);
        },
        snapshot: async () => {
          throw new Error('Document pi.provider version 2 is newer than version 1');
        },
      };

      await harness.registry!.snapshot().task('pi.generation')!.definition.phases.request!(
        undefined,
        runtime,
        undefined,
      );

      expect(runSpans()[0]!.attributes[GEN_AI_CONVERSATION_ID]).toMatch(/^[0-9a-f]{32}:1$/);
    });

    it('uses the provider session id of the run for the tool calls of its conversation', async () => {
      const runs = createRuns();
      startRun(4, runs).sessionId = '019a2b3c-4d5e-7f60-8172-93a4b5c6d7e8';
      const tool: PiTool = { name: 'get_weather', execute: async () => ({ content: [] }) };

      await instrumentTool(tool, runs, {}).execute({}, { conversationId: 4 }, undefined);

      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_CONVERSATION_ID]).toBe(
        '019a2b3c-4d5e-7f60-8172-93a4b5c6d7e8',
      );
    });

    it('uses the provider session id for a task of an extension on an idle conversation', async () => {
      const sessionId = '019a2b3c-4d5e-7f60-8172-93a4b5c6d7e8';
      const task: PiTask = {
        definition: {
          name: 'app.title',
          phases: {
            request: async () => {
              sendModelRequest();
            },
          },
        },
      };
      const harness: PiHarnessOptions = instrumentPiDurableHarnessOptions({
        registry: { snapshot: () => ({ task: () => task, tasks: () => [task] }), subscribe: () => () => undefined },
      });
      const runtime: PiTaskRuntime = {
        taskId: 7,
        conversationId: 1,
        agent: async () => ({}),
        commit: async () => undefined,
        snapshot: async () => ({ sessionId }),
      };

      await harness.registry!.snapshot().task('app.title')!.definition.phases.request!(undefined, runtime, undefined);

      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_CONVERSATION_ID]).toBe(sessionId);
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

    it('ends the tool calls in flight and forgets subagent links when the Harness closes', async () => {
      const harness = harnessFor(generationPhase([]));
      const runs = (harness as unknown as Record<symbol, PiRuns>)[Symbol.for('sentry.pi-durable.runs')]!;
      let onClose: (() => void) | undefined;
      endRunsOnClose(harness, { subscribeClose: (listener: () => void) => ((onClose = listener), () => undefined) });
      let delegated: () => void = () => undefined;
      const delegating = new Promise<void>(resolve => (delegated = resolve));
      const tool = instrumentTool(
        {
          name: 'delegate',
          execute: async (_args, api) => {
            await api.commit!(
              tx =>
                (tx as { createConversation: (...args: unknown[]) => unknown }).createConversation({
                  ownership: { kind: 'task', taskId: 7 },
                }),
              undefined,
            );
            delegated();
            return new Promise<PiToolExecutionResult>(() => undefined);
          },
        },
        runs,
        {},
      );
      runs.toolCalls.set(7, []);
      void tool.execute(
        {},
        {
          taskId: 7,
          callId: 'call_1',
          commit: async change => change({ createConversation: async () => ({ id: 42 }) }),
        },
        undefined,
      );
      await delegating;

      onClose!();

      expect(endedSpans.map(span => spanToStaticSpanJSON(span).status)).toEqual(['cancelled']);
      expect(spanToJSON(startRun(42, runs).span).parent_span_id).toBeUndefined();
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
      expect(runs[0]!.attributes[SENTRY_STATUS_MESSAGE]).toBe('model_error');
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
      expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_CONVERSATION_ID]).toBe(`${runs.harnessId}:0`);
    });
  });
});
