import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE } from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// This test runs the `@google/genai` SDK on the Workers runtime (with a
// canned global fetch) to verify the instrumentation works end-to-end on
// Cloudflare, not just against a hand-written mock client.

it('traces Google GenAI chat, generateContent, and embedContent calls', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(3);

      const byName = (name: string): SerializedStreamedSpan =>
        container.items.find((span: SerializedStreamedSpan) => span.name === name);

      expect(byName('chat gemini-1.5-pro')).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: expect.any(String),
        name: 'chat gemini-1.5-pro',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.google_genai', type: 'string' },
          'sentry.op': { value: 'gen_ai.chat', type: 'string' },
          [GEN_AI_SYSTEM]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME]: { value: 'chat', type: 'string' },
          [GEN_AI_REQUEST_MODEL]: { value: 'gemini-1.5-pro', type: 'string' },
          // collect LLM input and outputs (default true)
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: { value: 1, type: 'integer' },
          [GEN_AI_INPUT_MESSAGES]: { value: '[{"role":"user","content":"Tell me a joke"}]', type: 'string' },
          [GEN_AI_RESPONSE_TEXT]: { value: 'Hello from Google GenAI!', type: 'string' },
          [GEN_AI_USAGE_INPUT_TOKENS]: { value: 8, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 12, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { value: 20, type: 'integer' },
        },
      });

      expect(byName('generate_content gemini-1.5-flash')).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: expect.any(String),
        name: 'generate_content gemini-1.5-flash',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.google_genai', type: 'string' },
          'sentry.op': { value: 'gen_ai.generate_content', type: 'string' },
          [GEN_AI_SYSTEM]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME]: { value: 'generate_content', type: 'string' },
          [GEN_AI_REQUEST_MODEL]: { value: 'gemini-1.5-flash', type: 'string' },
          [GEN_AI_REQUEST_TEMPERATURE]: { value: 0.7, type: 'double' },
          [GEN_AI_REQUEST_TOP_P]: { value: 0.9, type: 'double' },
          [GEN_AI_REQUEST_MAX_TOKENS]: { value: 100, type: 'integer' },
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: { value: 1, type: 'integer' },
          [GEN_AI_INPUT_MESSAGES]: {
            value: '[{"role":"user","parts":[{"text":"What is the capital of France?"}]}]',
            type: 'string',
          },
          [GEN_AI_USAGE_INPUT_TOKENS]: { value: 8, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 12, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { value: 20, type: 'integer' },
          [GEN_AI_RESPONSE_TEXT]: { value: 'Hello from Google GenAI!', type: 'string' },
        },
      });

      expect(byName('embeddings text-embedding-004')).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: expect.any(String),
        name: 'embeddings text-embedding-004',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.google_genai', type: 'string' },
          'sentry.op': { value: 'gen_ai.embeddings', type: 'string' },
          [GEN_AI_SYSTEM]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME]: { value: 'embeddings', type: 'string' },
          [GEN_AI_REQUEST_MODEL]: { value: 'text-embedding-004', type: 'string' },
          [GEN_AI_EMBEDDINGS_INPUT]: { value: 'Hello world', type: 'string' },
        },
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
