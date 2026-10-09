import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_STATUS_MESSAGE,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, expect } from 'vitest';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { conditionalTest, RUNTIME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// The pi packages declare `engines.node >= 22.19`, so they can't live in the package's root
// `devDependencies` (that would break `yarn install` on the 20.19 CI matrix). Install them per-suite
// instead, guarded by the `min: 22` skip below.
const PI_DURABLE_DEPENDENCIES = {
  additionalDependencies: {
    '@earendil-works/pi-durable': '^1.0.0',
    '@earendil-works/pi-ai': '^1.0.0',
    '@earendil-works/chord': '^1.0.0',
  },
};

const CONTENT_ATTRIBUTES = [
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
];

conditionalTest({ min: 22 })('pi-durable integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      // The pi packages are ESM-only: their `exports` maps have no `require` condition.
      if (mode === 'cjs') {
        return;
      }

      test('traces each run as its own invoke_agent trace with chat and execute_tool children', async () => {
        let toolRunTraceId: string | undefined;
        let brokenToolSpanId: string | undefined;
        let errorTraceId: string | undefined;
        let errorSpanId: string | undefined;
        const conversationIds: unknown[] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              const agent = spans.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              expect(spans.filter(span => span.name === 'chat faux-model')).toHaveLength(2);
              // One span per run, request and tool call: a tool wrapped twice would add a span.
              expect(spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.pi_durable')).toHaveLength(
                5,
              );

              expect(agent.attributes[SENTRY_OP]?.value).toBe(GEN_AI_INVOKE_AGENT);
              expect(agent.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.pi_durable');
              expect(agent.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('invoke_agent');
              const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
              // The root conversation's id is `1` in every pi-durable storage, so it is prefixed
              // with a per-Harness id.
              expect(conversationId).toMatch(/^[0-9a-f]{32}:1$/);

              const chats = spans
                .filter(span => span.name === 'chat faux-model')
                .sort((a, b) => a.start_timestamp - b.start_timestamp);
              for (const chat of chats) {
                expect(chat.parent_span_id).toBe(agent.span_id);
                expect(chat.attributes[SENTRY_OP]?.value).toBe(GEN_AI_CHAT);
                expect(chat.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.pi_durable');
                expect(chat.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('faux');
                expect(chat.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('faux-model');
                expect(chat.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
                expect(chat.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBeGreaterThan(0);
                expect(chat.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBeGreaterThan(0);
                // pi-durable sends the prompt and the tools as positional system messages.
                expect(chat.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toBe('You are a weather assistant.');
                expect(
                  JSON.parse(String(chat.attributes[GEN_AI_TOOL_DEFINITIONS]?.value)).map(
                    (tool: { name: string }) => tool.name,
                  ),
                ).toEqual(['get_weather', 'broken']);
              }

              // Mapped from pi-ai's shape to the conventions: the tool calls and tool results the
              // second request carries are what Sentry's conversation view renders.
              expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))).toEqual([
                { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Berlin?' }] },
              ]);
              const answerInput = JSON.parse(String(chats[1]!.attributes[GEN_AI_INPUT_MESSAGES]?.value));
              expect(answerInput.map((message: { role: string }) => message.role)).toEqual([
                'user',
                'assistant',
                'tool',
                'tool',
              ]);
              expect(answerInput[1].parts).toEqual([
                { type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Berlin"}' },
                { type: 'tool_call', id: 'call_2', name: 'broken', arguments: '{}' },
              ]);
              expect(answerInput[2].parts).toEqual([
                {
                  type: 'tool_call_response',
                  id: 'call_1',
                  name: 'get_weather',
                  result: 'It is 21 degrees and sunny in Berlin.',
                },
              ]);
              expect(chats.map(chat => chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).sort()).toEqual([
                '["stop"]',
                '["tool_call"]',
              ]);
              expect(chats.map(chat => chat.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).join()).toContain(
                'It is 21 degrees and sunny in Berlin.',
              );

              const weather = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(weather.parent_span_id).toBe(agent.span_id);
              expect(weather.status).toBe('ok');
              expect(weather.attributes[SENTRY_OP]?.value).toBe(GEN_AI_EXECUTE_TOOL);
              expect(weather.attributes[GEN_AI_TOOL_NAME]?.value).toBe('get_weather');
              expect(weather.attributes[GEN_AI_TOOL_DESCRIPTION]?.value).toBe('Get the current weather for a city.');
              expect(weather.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call_1');
              expect(weather.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"city":"Berlin"}');
              expect(weather.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toContain('sunny in Berlin');
              expect(weather.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);

              const broken = spans.find(span => span.name === 'execute_tool broken')!;
              expect(broken.parent_span_id).toBe(agent.span_id);
              expect(broken.status).toBe('error');
              // The error result pi-durable gives the model, not the thrown error.
              expect(broken.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toContain('[error] broken tool');

              toolRunTraceId = agent.trace_id;
              brokenToolSpanId = broken.span_id;
              conversationIds.push(conversationId);
            },
          })
          .expect({
            span: container => {
              const spans = container.items;
              const agent = spans.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              expect(spans).toHaveLength(2);

              const chat = spans.find(span => span.name === 'chat faux-model')!;
              expect(chat.parent_span_id).toBe(agent.span_id);
              expect(chat.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toContain('Goodbye.');

              conversationIds.push(agent.attributes[GEN_AI_CONVERSATION_ID]?.value);
            },
          })
          .expect({
            span: container => {
              // The request that opened the Harness and submitted both inputs holds no agent work.
              expect(container.items).toHaveLength(1);
              expect(container.items[0]!.name).toBe('pi-durable-request');
            },
          })
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.value).toBe('broken tool');
              expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });

              errorTraceId = event.contexts?.trace?.trace_id;
              errorSpanId = event.contexts?.trace?.span_id;
            },
          })
          .start()
          .completed();

        // Both runs belong to the root conversation, so they share one conversation id.
        expect(conversationIds).toHaveLength(2);
        expect(conversationIds[0]).toBe(conversationIds[1]);
        // The tool error is reported on the failing call's span, in the run's trace.
        expect(errorTraceId).toBe(toolRunTraceId);
        expect(errorSpanId).toBe(brokenToolSpanId);
      });

      test('records no message content when the client turns gen_ai recording off', async () => {
        await createRunner()
          .withEnv({ PI_DURABLE_RECORDING: 'off' })
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              expect(spans).toHaveLength(5);
              for (const span of spans) {
                for (const attribute of CONTENT_ATTRIBUTES) {
                  expect(span.attributes[attribute]).toBeUndefined();
                }
              }
              const weather = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(weather.attributes[GEN_AI_TOOL_DESCRIPTION]?.value).toBe('Get the current weather for a city.');
              expect(
                spans.find(span => span.name === 'chat faux-model')!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value,
              ).toBeGreaterThan(0);
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              for (const span of container.items) {
                for (const attribute of CONTENT_ATTRIBUTES) {
                  expect(span.attributes[attribute]).toBeUndefined();
                }
              }
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              expect(container.items[0]!.name).toBe('pi-durable-request');
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('broken tool');
            },
          })
          .start()
          .completed();
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tools.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('reports app tool failures but not failures of the built-in coding tools', async () => {
        const appErrors: unknown[] = [];

        // Ordered, with spans ignored: a captured failure of the built-in `bash` tool would be an
        // extra event before the sentinel, which the scenario sends once everything else is sent.
        // The two app failures are processed concurrently, so they may arrive in either order.
        await createRunner()
          .ignore('span')
          .expect({
            event: event => {
              expect(['app read failed', 'Intentional pi-durable tool failure']).toContain(
                event.exception?.values?.[0]?.value,
              );
              appErrors.push(event.exception?.values?.[0]?.value);
            },
          })
          .expect({
            event: event => {
              expect(['app read failed', 'Intentional pi-durable tool failure']).toContain(
                event.exception?.values?.[0]?.value,
              );
              appErrors.push(event.exception?.values?.[0]?.value);
            },
          })
          .expect({
            event: event => {
              expect(event.message).toBe('pi-durable tools done');
            },
          })
          .start()
          .completed();

        expect(appErrors.sort()).toEqual(['Intentional pi-durable tool failure', 'app read failed']);
      });

      test('records the tool result the model receives', async () => {
        let errorSpanId: string | undefined;
        let failingToolSpanId: string | undefined;

        await createRunner()
          .unordered()
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.value).toBe('Intentional pi-durable tool failure');
              expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
              errorSpanId = event.contexts?.trace?.span_id;
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('app read failed');
            },
          })
          .expect({
            span: container => {
              const spans = container.items;

              const bash = spans.find(span => span.name === 'execute_tool bash')!;
              expect(bash.status).toBe('error');
              expect(bash.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toMatch(/Command exited with code \d+/);

              const read = spans.find(span => span.name === 'execute_tool read')!;
              expect(read.status).toBe('error');
              expect(read.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toContain('app read failed');

              // The streamed output becomes the result, since the tool returns no content.
              const streamer = spans.find(span => span.name === 'execute_tool streamer')!;
              expect(streamer.status).toBe('ok');
              expect(streamer.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('line 1\nline 2\n');

              const secret = spans.find(span => span.name === 'execute_tool secret')!;
              expect(secret.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('redacted by afterTool');

              const failNow = spans.find(span => span.name === 'execute_tool fail_now')!;
              expect(failNow.status).toBe('error');
              failingToolSpanId = failNow.span_id;
            },
          })
          .start()
          .completed();

        expect(errorSpanId).toBe(failingToolSpanId);
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-reports.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('captures failures pi-durable does not propagate, and tags idle compaction with its conversation', async () => {
        let runConversationId: unknown;
        let compactionConversationId: unknown;

        await createRunner()
          .unordered()
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.value).toBe('afterResponse hook failed');
              expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
            },
          })
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.value).toBe('card declined');
              expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
            },
          })
          .expect({
            span: container => {
              const agent = container.items.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              runConversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
            },
          })
          .expect({
            span: container => {
              // A compaction started while idle belongs to no run, so its request is a trace of its own.
              expect(container.items).toHaveLength(1);
              const summary = container.items[0]!;
              expect(summary.is_segment).toBe(true);
              expect(summary.attributes[SENTRY_OP]?.value).toBe(GEN_AI_CHAT);
              compactionConversationId = summary.attributes[GEN_AI_CONVERSATION_ID]?.value;
            },
          })
          .start()
          .completed();

        expect(runConversationId).toMatch(/^[0-9a-f]{32}:1$/);
        expect(compactionConversationId).toBe(runConversationId);
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-subagent.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('nests subagent runs under the tool call that started them', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              const parent = spans.find(span => span.is_segment)!;
              const delegate = spans.find(span => span.name === 'execute_tool delegate')!;
              expect(parent.name).toBe('invoke_agent');
              expect(delegate.parent_span_id).toBe(parent.span_id);

              // The subagent's run is a child of the delegating call, in the same trace, on its own
              // conversation of the same Harness.
              const child = spans.find(span => span.name === 'invoke_agent' && !span.is_segment)!;
              expect(child.parent_span_id).toBe(delegate.span_id);
              const parentConversation = String(parent.attributes[GEN_AI_CONVERSATION_ID]?.value);
              const childConversation = String(child.attributes[GEN_AI_CONVERSATION_ID]?.value);
              expect(childConversation).not.toBe(parentConversation);
              expect(childConversation.split(':')[0]).toBe(parentConversation.split(':')[0]);

              const childChat = spans.find(span => span.parent_span_id === child.span_id)!;
              expect(childChat.name).toBe('chat faux-model');
              expect(childChat.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(childConversation);
              expect(delegate.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('Answer: Weather in Vienna?');
            },
          })
          .expect({
            span: container => {
              const spans = container.items;
              const parent = spans.find(span => span.is_segment)!;
              const fork = spans.find(span => span.name === 'execute_tool fork_delegate')!;
              const child = spans.find(span => span.name === 'invoke_agent' && !span.is_segment)!;
              expect(fork.parent_span_id).toBe(parent.span_id);
              expect(child.parent_span_id).toBe(fork.span_id);
              expect(fork.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('Answer: Forked task.');
            },
          })
          .expect({
            span: container => {
              const spans = container.items;
              const batch = spans.find(span => span.name === 'execute_tool batch')!;
              const inner = spans.find(span => span.name === 'execute_tool inner')!;
              expect(batch.parent_span_id).toBe(spans.find(span => span.is_segment)!.span_id);
              // A tool that runs another tool itself: the inner call ends with its own result.
              expect(inner.parent_span_id).toBe(batch.span_id);
              expect(inner.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('INNER RESULT');
              expect(batch.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('OUTER RESULT');
            },
          })
          .start()
          .completed();
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-retention.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      // Bun does not implement `v8.setFlagsFromString`, which the scenario needs to force GC.
      test.skipIf(RUNTIME === 'bun')(
        'does not keep the traces of tool calls alive for subagent conversations that never run',
        async () => {
          await createRunner()
            .ignore('span')
            .expect({ event: { message: 'pi-durable retention', extra: { toolCalls: 3, alive: 0 } } })
            .start()
            .completed();
        },
      );
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-restart-abort.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('starts no run for an abort handler in a Harness that never saw the run', async () => {
        await createRunner()
          .ignore('span')
          .expect({
            event: {
              message: 'pi-durable restart abort',
              extra: { status: 'unanswered', reason: 'aborted', runsStarted: 0 },
            },
          })
          .start()
          .completed();
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-interrupted.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('reports a provider that throws as a fault, and nothing for failed, aborted or closed runs', async () => {
        await createRunner()
          .ignore('span')
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.value).toBe('provider broke');
              expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
            },
          })
          .expect({
            event: event => {
              expect(event.message).toBe('pi-durable interrupted done');
            },
          })
          .start()
          .completed();
      });

      test('ends every run that does not end with an answer', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              // 1. The model request failed: the run and the request are errors.
              const chat = container.items.find(span => span.name === 'chat faux-model')!;
              expect(chat.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('Fail please.');
              expect(chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["error"]');
              expect(chat.status).toBe('error');
              expect(chat.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('internal_error');
              const agent = container.items.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              expect(agent.status).toBe('error');
              expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('model_error');
            },
          })
          .expect({
            span: container => {
              // 2. The provider threw: the generation faulted.
              const chat = container.items.find(span => span.name === 'chat faux-model')!;
              expect(chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toBeUndefined();
              expect(chat.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('internal_error');
              const agent = container.items.find(span => span.is_segment)!;
              expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('internal_error');
            },
          })
          .expect({
            span: container => {
              // 3. Aborted while the tool ran: cancelled, which streamed spans report as ok.
              const slow = container.items.find(span => span.name === 'execute_tool slow')!;
              expect(slow.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"job":"abort"}');
              expect(slow.status).toBe('ok');
              expect(container.items.find(span => span.is_segment)!.status).toBe('ok');
            },
          })
          .expect({
            span: container => {
              // 4. Aborted while the model request ran.
              const chat = container.items.find(span => span.name === 'chat faux-model')!;
              expect(chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["aborted"]');
              expect(container.items).toHaveLength(2);
            },
          })
          .expect({
            span: container => {
              // 5. The Harness closed while the tool ran: the run still ends, so the trace has a segment.
              const slow = container.items.find(span => span.name === 'execute_tool slow')!;
              expect(slow.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"job":"close"}');
              const agent = container.items.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              expect(slow.parent_span_id).toBe(agent.span_id);
            },
          })
          .expect({
            span: container => {
              // 6. The run failed, and the Harness closed right after `wait()`, before the commit that
              // ended the run resolved: the run keeps its own status.
              const chat = container.items.find(span => span.name === 'chat faux-model')!;
              expect(chat.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('Fail, then close.');
              const agent = container.items.find(span => span.is_segment)!;
              expect(agent.status).toBe('error');
              expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('model_error');
            },
          })
          .start()
          .completed();
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-concurrent.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('keeps concurrent runs apart and out of the scopes of the requests that submitted them', async () => {
        const runTraceIds = new Set<string>();
        const errorTraceIds = new Set<string>();

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              const agent = spans.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              const chats = spans.filter(span => span.name === 'chat faux-model');
              expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))[0].parts[0].content).toBe(
                'request A',
              );
              // The run's own conversation id, not the one the request set on its scope.
              const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
              expect(conversationId).toMatch(/^[0-9a-f]{32}:\d+$/);
              for (const span of spans) {
                expect(span.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
                expect(span.attributes['request']).toBeUndefined();
              }
              expect(
                spans.find(span => span.name === 'execute_tool work')!.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value,
              ).toBe('{"tag":"request A"}');
              runTraceIds.add(agent.trace_id);
            },
          })
          .expect({
            span: container => {
              const spans = container.items;
              const agent = spans.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              const chats = spans.filter(span => span.name === 'chat faux-model');
              expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))[0].parts[0].content).toBe(
                'request B',
              );
              const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
              expect(conversationId).toMatch(/^[0-9a-f]{32}:\d+$/);
              for (const span of spans) {
                expect(span.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
                expect(span.attributes['request']).toBeUndefined();
              }
              expect(
                spans.find(span => span.name === 'execute_tool work')!.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value,
              ).toBe('{"tag":"request B"}');
              runTraceIds.add(agent.trace_id);
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('work failed for request A');
              expect(event.tags?.request).toBeUndefined();
              errorTraceIds.add(String(event.contexts?.trace?.trace_id));
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('work failed for request B');
              expect(event.tags?.request).toBeUndefined();
              errorTraceIds.add(String(event.contexts?.trace?.trace_id));
            },
          })
          .start()
          .completed();

        // Each tool error belongs to its run's trace.
        expect(errorTraceIds).toEqual(runTraceIds);
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-compaction.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('keeps a compaction that pi-durable starts for a run inside that run', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              const summary = spans.find(span =>
                String(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).includes('Summary'),
              )!;
              const agent = spans.find(span => span.is_segment)!;
              expect(agent.name).toBe('invoke_agent');
              expect(summary.parent_span_id).toBe(agent.span_id);
              // pi-durable completes the summary without streaming; the run's own request streams.
              expect(summary.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
              const answer = spans.find(span =>
                String(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).includes('Third answer'),
              )!;
              expect(answer.parent_span_id).toBe(agent.span_id);
              expect(answer.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
            },
          })
          .expect({
            span: container => expect(container.items.find(span => span.is_segment)!.name).toBe('invoke_agent'),
          })
          .expect({
            span: container => expect(container.items.find(span => span.is_segment)!.name).toBe('invoke_agent'),
          })
          .start()
          .completed();
      });
    },
    PI_DURABLE_DEPENDENCIES,
  );
});
