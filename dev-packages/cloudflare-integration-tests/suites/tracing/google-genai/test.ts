import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
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
          [GEN_AI_SYSTEM_ATTRIBUTE]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'chat', type: 'string' },
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: 'gemini-1.5-pro', type: 'string' },
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 8, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 12, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 20, type: 'integer' },
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
          [GEN_AI_SYSTEM_ATTRIBUTE]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'generate_content', type: 'string' },
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: 'gemini-1.5-flash', type: 'string' },
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: { value: 0.7, type: 'double' },
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: { value: 0.9, type: 'double' },
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: { value: 100, type: 'integer' },
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 8, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 12, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 20, type: 'integer' },
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
          [GEN_AI_SYSTEM_ATTRIBUTE]: { value: 'google_genai', type: 'string' },
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'embeddings', type: 'string' },
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: 'text-embedding-004', type: 'string' },
        },
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
