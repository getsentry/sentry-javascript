import type { SerializedStreamedSpanContainer } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

// `@flue/runtime` declares `engines.node >= 22.19`.
describe.runIf(supports({ min: 22 }))('Flue integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // `@flue/runtime` is ESM-only — its `exports` map has no `require` condition, so there is no
  // CJS variant of this scenario to run.
  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates the invoke_agent / chat / execute_tool hierarchy', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            const root = spans.find(span => span.name === 'flue-test')!;
            expect(root.is_segment).toBe(true);

            // Counted rather than looked up: the interceptor skips the submission wrapper
            // operation, so one dispatch opens exactly one agent span, and each tool call is spanned
            // once. The turns are spanned by the pi-ai integration, once each: a provider SDK
            // reporting the same request would add a span. `find` passes just as happily on a duplicate.
            expect(spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ai.flue')).toHaveLength(2);
            expect(spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ai.pi_ai')).toHaveLength(2);

            const agents = spans.filter(span => span.name === 'invoke_agent Hello');
            const chats = spans.filter(span => span.name === 'chat faux-model');
            const tools = spans.filter(span => span.name === 'execute_tool get_weather');
            expect(agents).toHaveLength(1);
            expect(tools).toHaveLength(1);
            // One turn asks for the tool, the second answers with its result.
            expect(chats).toHaveLength(2);

            const agent = agents[0]!;
            expect(agent.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
            expect(agent.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('invoke_agent');
            expect(agent.attributes[GEN_AI_AGENT_NAME]?.value).toBe('Hello');
            expect(agent.parent_span_id).toBe(root.span_id);

            const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
            expect(conversationId).toEqual(expect.any(String));

            // Both turns, not just the first: they leave the provider by different paths (a tool
            // call, then a final answer).
            for (const chat of chats) {
              expect(chat.attributes['sentry.op']?.value).toBe('gen_ai.chat');
              expect(chat.attributes['sentry.origin']?.value).toBe('auto.ai.pi_ai');
              expect(chat.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
              expect(chat.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
              expect(chat.parent_span_id).toBe(agent.span_id);
              expect(chat.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBeGreaterThan(0);
              expect(chat.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBeGreaterThan(0);
              expect(chat.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBeGreaterThan(0);
              // pi-ai computes cost itself; no provider SDK reports it. The faux provider prices
              // every model at zero, so this only proves the attribute is mapped.
              expect(chat.attributes[GEN_AI_COST_TOTAL_TOKENS]?.value).toEqual(expect.any(Number));
            }

            // pi-ai's `toolUse` is reported as the conventions' `tool_call`.
            expect(chats.map(chat => chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).sort()).toEqual([
              '["stop"]',
              '["tool_call"]',
            ]);

            const tool = tools[0]!;
            // The tool has to actually run: a schema mismatch still produces a correctly named and
            // parented span, so only the status separates a real call from a rejected one.
            expect(tool.status).toBe('ok');
            expect(tool.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
            expect(tool.attributes['sentry.origin']?.value).toBe('auto.ai.flue');
            expect(tool.attributes[GEN_AI_TOOL_NAME]?.value).toBe('get_weather');

            // Tool spans are siblings of `chat` under the agent invocation, matching how Flue's
            // own OpenTelemetry adapter projects them.
            expect(tool.parent_span_id).toBe(agent.span_id);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records the messages of the turns in the gen_ai conventions shape', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chats = container.items
              .filter(span => span.name === 'chat faux-model')
              .sort((a, b) => a.start_timestamp - b.start_timestamp);
            expect(chats).toHaveLength(2);

            // Flue sends pi-ai's shape (`toolResult`, `toolCall`); Sentry renders the conventions.
            expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))).toEqual([
              { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Berlin?' }] },
            ]);
            expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value))).toEqual([
              {
                role: 'assistant',
                parts: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Berlin"}' }],
                finish_reason: 'tool_call',
              },
            ]);

            const answerInput = JSON.parse(String(chats[1]!.attributes[GEN_AI_INPUT_MESSAGES]?.value));
            expect(answerInput.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant', 'tool']);
            expect(answerInput[2].parts[0]).toMatchObject({
              type: 'tool_call_response',
              id: 'call_1',
              name: 'get_weather',
            });
            expect(answerInput[2].parts[0].result).toContain('sunny in Berlin');
            expect(chats[1]!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toContain('You are a helpful assistant.');

            // The tool span records the result the model receives, not Flue's internal wrapper.
            const tool = container.items.find(span => span.name === 'execute_tool get_weather')!;
            expect(tool.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"city":"Berlin"}');
            expect(tool.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toContain('sunny in Berlin');
            expect(tool.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).not.toContain('details');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-separate-requests.mjs', 'instrument.mjs', (createRunner, test) => {
    test('puts each dispatch in the trace of the request that admitted it', async () => {
      const expectAgentUnder = (requestName: string) => ({
        span: (container: SerializedStreamedSpanContainer) => {
          const request = container.items.find(span => span.name === requestName)!;
          expect(request.is_segment).toBe(true);

          const agents = container.items.filter(span => span.name === 'invoke_agent Hello');
          expect(agents).toHaveLength(1);
          expect(agents[0]!.parent_span_id).toBe(request.span_id);
        },
      });

      await createRunner()
        .unordered()
        .expect(expectAgentUnder('request-a'))
        .expect(expectAgentUnder('request-b'))
        .start()
        .completed();
    });
  });
});
