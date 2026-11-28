import type { SerializedStreamedSpan } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

const attr = (span: SerializedStreamedSpan | undefined, key: string): unknown => span?.attributes[key]?.value;

/** The spans of the run with `threadId`, by op, in start order. */
function runSpans(spans: SerializedStreamedSpan[], threadId: string) {
  const run = spans
    .filter(span => attr(span, GEN_AI_CONVERSATION_ID) === threadId)
    .sort((a, b) => a.start_timestamp - b.start_timestamp);
  for (const span of run) {
    expect(attr(span, SENTRY_ORIGIN)).toBe('auto.ai.tanstack_ai');
  }
  const agent = run.find(span => attr(span, SENTRY_OP) === GEN_AI_INVOKE_AGENT)!;
  const children = run.filter(span => span !== agent);
  for (const child of children) {
    expect(child.parent_span_id).toBe(agent.span_id);
  }
  return {
    agent,
    chats: children.filter(span => attr(span, SENTRY_OP) === GEN_AI_CHAT),
    tools: children.filter(span => attr(span, SENTRY_OP) === GEN_AI_EXECUTE_TOOL),
  };
}

describe('TanStack AI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // `@tanstack/ai` is ESM-only.
  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records the agent run, its model calls and its tool runs', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const spans = container.items;
            const createStream = spans.find(span => span.name === 'create-stream')!;
            const main = spans.find(span => span.is_segment)!;

            const streamed = runSpans(spans, 'thread-stream');
            expect(streamed.agent.parent_span_id).toBe(createStream.span_id);
            expect(streamed.agent.name).toBe('invoke_agent');
            expect(attr(streamed.agent, GEN_AI_PROVIDER_NAME)).toBe('fake');
            expect(attr(streamed.agent, GEN_AI_USAGE_INPUT_TOKENS)).toBeUndefined();
            expect(JSON.parse(String(attr(streamed.agent, GEN_AI_OUTPUT_MESSAGES)))).toEqual([
              {
                role: 'assistant',
                parts: [{ type: 'text', content: 'It is 21 degrees in Kyoto.' }],
                finish_reason: 'stop',
              },
            ]);

            expect(streamed.chats.map(span => span.name)).toEqual(['chat fake-model', 'chat fake-model']);
            const [toolCall, answer] = streamed.chats;
            expect(attr(toolCall, GEN_AI_REQUEST_MODEL)).toBe('fake-model');
            expect(attr(toolCall, GEN_AI_REQUEST_TEMPERATURE)).toBe(0.5);
            expect(attr(toolCall, GEN_AI_RESPONSE_STREAMING)).toBe(true);
            expect(attr(toolCall, GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK)).toBeGreaterThan(0);
            expect(attr(toolCall, GEN_AI_RESPONSE_FINISH_REASONS)).toBe('["tool_calls"]');
            expect(attr(toolCall, GEN_AI_USAGE_INPUT_TOKENS)).toBeGreaterThan(0);
            expect(attr(toolCall, GEN_AI_USAGE_OUTPUT_TOKENS)).toBeGreaterThan(0);
            expect(attr(toolCall, GEN_AI_TOOL_DEFINITIONS)).toContain('get_weather');
            expect(attr(toolCall, GEN_AI_SYSTEM_INSTRUCTIONS)).toBe(
              '[{"type":"text","content":"You are a weather assistant."}]',
            );
            expect(JSON.parse(String(attr(toolCall, GEN_AI_INPUT_MESSAGES)))).toEqual([
              { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Kyoto?' }] },
            ]);
            expect(JSON.parse(String(attr(toolCall, GEN_AI_OUTPUT_MESSAGES)))).toEqual([
              {
                role: 'assistant',
                parts: [
                  { type: 'text', content: 'Let me check.' },
                  { type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Kyoto"}' },
                ],
                finish_reason: 'tool_calls',
              },
            ]);
            expect(JSON.parse(String(attr(answer, GEN_AI_INPUT_MESSAGES)))).toHaveLength(3);
            expect(attr(answer, GEN_AI_RESPONSE_FINISH_REASONS)).toBe('["stop"]');

            expect(streamed.tools).toHaveLength(1);
            const [tool] = streamed.tools;
            expect(tool!.name).toBe('execute_tool get_weather');
            expect(tool!.start_timestamp).toBeGreaterThanOrEqual(toolCall!.end_timestamp);
            expect(tool!.end_timestamp).toBeLessThanOrEqual(answer!.start_timestamp);
            expect(attr(tool, 'gen_ai.tool.call.id')).toBe('call_1');
            expect(attr(tool, GEN_AI_TOOL_CALL_ARGUMENTS)).toBe('{"city":"Kyoto"}');
            expect(attr(tool, GEN_AI_TOOL_CALL_RESULT)).toBe('{"city":"Kyoto","temperature":21}');

            const plain = runSpans(spans, 'thread-plain');
            expect(plain.agent.parent_span_id).toBe(main.span_id);
            expect(plain.chats).toHaveLength(1);
            expect(attr(plain.agent, GEN_AI_RESPONSE_STREAMING)).toBe(false);
            expect(attr(plain.chats[0], GEN_AI_RESPONSE_STREAMING)).toBe(false);
            expect(attr(plain.chats[0], GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK)).toBeUndefined();

            const structured = runSpans(spans, 'thread-structured');
            expect(structured.chats).toHaveLength(1);
            expect(attr(structured.chats[0], GEN_AI_RESPONSE_STREAMING)).toBe(false);
            expect(attr(structured.chats[0], GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK)).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-errors.mjs', 'instrument.mjs', (createRunner, test) => {
    test('marks failed tool runs, model calls and stopped streams, and captures the tool error', async () => {
      await createRunner()
        .unordered()
        .expect({
          event: {
            exception: {
              values: [
                expect.objectContaining({
                  value: 'Weather service down',
                  mechanism: expect.objectContaining({ type: 'auto.ai.tanstack_ai', handled: false }),
                }),
              ],
            },
          },
        })
        .expect({
          span: container => {
            const toolError = runSpans(container.items, 'thread-tool-error');
            expect(toolError.agent.status).toBe('ok');
            expect(toolError.tools[0]!.status).toBe('error');
            expect(attr(toolError.tools[0], GEN_AI_TOOL_CALL_RESULT)).toBeUndefined();

            const modelError = runSpans(container.items, 'thread-model-error');
            expect(modelError.agent.status).toBe('error');
            expect(modelError.chats.map(span => span.status)).toEqual(['error']);
            expect(attr(modelError.chats[0], 'test.error')).toBe('Model overloaded');

            // `onAbort` ends these spans. Span streaming sends the `cancelled` status as `ok`.
            const stopped = runSpans(container.items, 'thread-stopped');
            expect(stopped.chats).toHaveLength(1);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('decides the recording per call and runs the span hooks for every span', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const streamed = runSpans(container.items, 'thread-stream');
            const plain = runSpans(container.items, 'thread-plain');
            const all = [streamed.agent, ...streamed.chats, ...streamed.tools, plain.agent, ...plain.chats];

            expect(all).toHaveLength(6);
            for (const span of all) {
              expect(attr(span, 'test.start')).toBe(attr(span, GEN_AI_CONVERSATION_ID));
              expect(attr(span, 'test.end')).toBe('ok');
              expect(attr(span, GEN_AI_OUTPUT_MESSAGES)).toBeUndefined();
            }
            expect(attr(streamed.chats[0], GEN_AI_INPUT_MESSAGES)).toBeUndefined();
            expect(attr(streamed.tools[0], GEN_AI_TOOL_CALL_ARGUMENTS)).toBeUndefined();
            expect(attr(streamed.tools[0], GEN_AI_TOOL_CALL_RESULT)).toBeUndefined();
            expect(attr(plain.chats[0], GEN_AI_INPUT_MESSAGES)).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });
});
