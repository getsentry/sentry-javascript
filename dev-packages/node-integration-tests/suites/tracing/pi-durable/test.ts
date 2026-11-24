import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
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
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

// The provider session id that pi-durable stores with each conversation, a UUIDv7.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CONTENT_ATTRIBUTES = [
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
];

// The pi packages declare `engines.node >= 22.19`.
describe.runIf(supports({ min: 22 }))('pi-durable integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // The pi packages are ESM-only: their `exports` maps have no `require` condition.
  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
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
            // One span per run and tool call, and one per request from the pi-ai integration: a tool
            // wrapped twice, or a request reported by a provider SDK too, would add a span.
            expect(spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.pi_durable')).toHaveLength(
              3,
            );
            expect(spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.pi_ai')).toHaveLength(2);

            expect(agent.attributes[SENTRY_OP]?.value).toBe(GEN_AI_INVOKE_AGENT);
            expect(agent.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.pi_durable');
            expect(agent.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('invoke_agent');
            const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
            expect(conversationId).toMatch(UUID);

            const chats = spans
              .filter(span => span.name === 'chat faux-model')
              .sort((a, b) => a.start_timestamp - b.start_timestamp);
            for (const chat of chats) {
              expect(chat.parent_span_id).toBe(agent.span_id);
              expect(chat.attributes[SENTRY_OP]?.value).toBe(GEN_AI_CHAT);
              expect(chat.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.pi_ai');
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

    for (const [setting, recording] of [
      ['the client', 'off'],
      ['`piDurableIntegration`', 'integration-off'],
    ]) {
      test(`records no message content when ${setting} turns gen_ai recording off`, async () => {
        await createRunner()
          .withEnv({ PI_DURABLE_RECORDING: recording })
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
    }
  });

  createEsmTests(__dirname, 'scenario-tools.mjs', 'instrument.mjs', (createRunner, test) => {
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
  });

  createEsmTests(__dirname, 'scenario-reports.mjs', 'instrument.mjs', (createRunner, test) => {
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

      expect(runConversationId).toMatch(UUID);
      expect(compactionConversationId).toBe(runConversationId);
    });
  });

  createEsmTests(__dirname, 'scenario-subagent.mjs', 'instrument.mjs', (createRunner, test) => {
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
            // conversation.
            const child = spans.find(span => span.name === 'invoke_agent' && !span.is_segment)!;
            expect(child.parent_span_id).toBe(delegate.span_id);
            const parentConversation = String(parent.attributes[GEN_AI_CONVERSATION_ID]?.value);
            const childConversation = String(child.attributes[GEN_AI_CONVERSATION_ID]?.value);
            expect(parentConversation).toMatch(UUID);
            expect(childConversation).toMatch(UUID);
            expect(childConversation).not.toBe(parentConversation);

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
        .expect({
          span: container => {
            const spans = container.items;
            const relay = spans.find(span => span.name === 'execute_tool relay')!;
            const inner = spans.find(span => span.name === 'execute_tool inner')!;
            expect(relay.parent_span_id).toBe(spans.find(span => span.is_segment)!.span_id);
            // A nested call is a task of its own: its span is a child of the calling tool's span.
            expect(inner.parent_span_id).toBe(relay.span_id);
            expect(inner.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('INNER RESULT');
            expect(relay.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('RELAY RESULT');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const recorded = container.items
                .filter(span => /^(chat|execute_tool) /.test(span.name))
                .sort((a, b) => a.start_timestamp - b.start_timestamp)
                .map(({ name, attributes }) => [
                  name,
                  GEN_AI_INPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_ARGUMENTS in attributes,
                  GEN_AI_OUTPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_RESULT in attributes,
                ]);
              expect(recorded).toEqual([
                ['chat faux-model', true, true],
                ['execute_tool get_weather', false, false],
                ['chat faux-model', true, false],
              ]);
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks of the model and tool calls', async () => {
        await createRunner()
          .expect({
            span: container => {
              const hooks = container.items
                .filter(span => /^(chat|execute_tool) /.test(span.name))
                .sort((a, b) => a.start_timestamp - b.start_timestamp)
                .map(({ attributes }) => [attributes['test.start']?.value, attributes['test.end']?.value]);
              expect(hooks).toEqual([
                ['chat', 'toolUse'],
                ['Berlin', 'It is sunny in Berlin.'],
                ['chat', 'stop'],
              ]);
            },
          })
          .start()
          .completed();
      });
    },
  );
});
