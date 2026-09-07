import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT } from '@sentry/core';
import { GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// This test runs the `@langchain/openai` model (backed by the
// `openai` SDK, with a canned fetch) on the Workers runtime to verify the
// LangChain callback instrumentation works end-to-end on Cloudflare.

it('traces a LangChain chat model invocation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      expect(segmentSpan?.name).toBe('GET /');

      const genAiSpans = spans.filter(span => getSpanOp(span)?.startsWith('gen_ai.'));
      expect(genAiSpans).toHaveLength(1);

      expect(genAiSpans[0]).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: expect.any(String),
        name: 'chat gpt-3.5-turbo',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.langchain', type: 'string' },
          'sentry.op': { value: 'gen_ai.chat', type: 'string' },
          [GEN_AI_PROVIDER_NAME]: { value: 'openai', type: 'string' },
          [GEN_AI_OPERATION_NAME]: { value: 'chat', type: 'string' },
          [GEN_AI_REQUEST_MODEL]: { value: 'gpt-3.5-turbo', type: 'string' },
          [GEN_AI_REQUEST_TEMPERATURE]: { value: 0.7, type: 'double' },
          [GEN_AI_REQUEST_MAX_TOKENS]: { value: 100, type: 'integer' },
          [GEN_AI_RESPONSE_FINISH_REASONS]: { value: '["stop"]', type: 'string' },
          [GEN_AI_USAGE_INPUT_TOKENS]: { value: 10, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 15, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { value: 25, type: 'integer' },
          [GEN_AI_RESPONSE_MODEL]: { value: 'gpt-3.5-turbo', type: 'string' },
          [GEN_AI_RESPONSE_ID]: { value: 'chatcmpl-mock123', type: 'string' },
          [GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]: { value: 'stop', type: 'string' },
          [SENTRY_TRACE_LIFECYCLE]: { value: 'stream', type: 'string' },
          [SENTRY_SEGMENT_NAME]: { value: segmentSpan!.name, type: 'string' },
          [SENTRY_SEGMENT_ID]: { value: segmentSpan!.span_id, type: 'string' },
          [SENTRY_SDK_NAME]: { value: 'sentry.javascript.cloudflare', type: 'string' },
          [SENTRY_SDK_VERSION]: { value: SDK_VERSION, type: 'string' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: { value: 'production', type: 'string' },
        },
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
