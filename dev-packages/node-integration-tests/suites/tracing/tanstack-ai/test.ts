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
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
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
  };
}

describe('TanStack AI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // `@tanstack/ai` is ESM-only.
  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records the agent run and its model calls', async () => {
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
                parts: [{ type: 'text', content: 'It is 21 degrees in Vienna.' }],
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
              { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Vienna?' }] },
            ]);
            expect(JSON.parse(String(attr(toolCall, GEN_AI_OUTPUT_MESSAGES)))).toEqual([
              {
                role: 'assistant',
                parts: [
                  { type: 'text', content: 'Let me check.' },
                  { type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
                ],
                finish_reason: 'tool_calls',
              },
            ]);
            expect(JSON.parse(String(attr(answer, GEN_AI_INPUT_MESSAGES)))).toHaveLength(3);
            expect(attr(answer, GEN_AI_RESPONSE_FINISH_REASONS)).toBe('["stop"]');

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
    test('marks a failed model call and its run', async () => {
      await createRunner()
        .expect({
          span: container => {
            const modelError = runSpans(container.items, 'thread-model-error');
            expect(modelError.agent.status).toBe('error');
            expect(modelError.chats.map(span => span.status)).toEqual(['error']);
          },
        })
        .start()
        .completed();
    });
  });
});
