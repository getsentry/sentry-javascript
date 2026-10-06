import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import {
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
} from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording disabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(8);
            const chatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-3.5-turbo',
            );
            expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(chatCompletionSpan!.status).toBe('ok');
            expect(chatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({
              type: 'double',
              value: 0.7,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });

            const responsesSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-3.5-turbo',
            );
            expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(responsesSpan!.status).toBe('ok');
            expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(responsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 13,
            });

            const nonStreamingErrorSpan = spans.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(nonStreamingErrorSpan!.status).toBe('error');
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });

            const streamingChatCompletionSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan!.name).toBe('chat gpt-4');
            expect(streamingChatCompletionSpan!.status).toBe('ok');
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({
              type: 'double',
              value: 0.8,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-123',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingResponsesSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_stream_456',
            );
            expect(streamingResponsesSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesSpan!.status).toBe('ok');
            expect(streamingResponsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_stream_456',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 6,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 16,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingErrorSpan = spans.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingErrorSpan!.status).toBe('error');
            expect(streamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingErrorSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingErrorSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });

            const parsedChatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedChatCompletionSpan!.name).toBe('chat gpt-4o');
            expect(parsedChatCompletionSpan!.status).toBe('ok');
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(parsedChatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(parsedChatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });

            const parsedResponsesSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedResponsesSpan!.name).toBe('chat gpt-4o');
            expect(parsedResponsesSpan!.status).toBe('ok');
            expect(parsedResponsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(parsedResponsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(parsedResponsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(parsedResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 13,
            });

            // GenAI inputs and outputs must never be recorded when `dataCollection.genAI` disables them.
            // Asserting over every GenAI span catches attributes leaking onto
            // spans which are not individually inspected above.
            for (const span of spans) {
              expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(span.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
              expect(span.attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();
              expect(span.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBeUndefined();
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording enabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(8);
            const chatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-3.5-turbo',
            );
            expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(chatCompletionSpan!.status).toBe('ok');
            expect(chatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({
              type: 'double',
              value: 0.7,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the capital of France?"}]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toEqual({
              type: 'string',
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: '["Hello from OpenAI mock!"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });

            const responsesSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-3.5-turbo',
            );
            expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(responsesSpan!.status).toBe('ok');
            expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(responsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: 'Translate this to French: Hello',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: 'Response to: Translate this to French: Hello',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 13,
            });

            const nonStreamingErrorSpan = spans.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(nonStreamingErrorSpan!.status).toBe('error');
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"This will fail"}]',
            });

            const streamingChatCompletionSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan!.name).toBe('chat gpt-4');
            expect(streamingChatCompletionSpan!.status).toBe('ok');
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({
              type: 'double',
              value: 0.8,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"Tell me about streaming"}]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toEqual({
              type: 'string',
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: 'Hello from OpenAI streaming!',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-123',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingResponsesSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_stream_456',
            );
            expect(streamingResponsesSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesSpan!.status).toBe('ok');
            expect(streamingResponsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: 'Test streaming responses API',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: 'Streaming response to: Test streaming responses APITest streaming responses API',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_stream_456',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 6,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 16,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingErrorSpan = spans.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingErrorSpan!.status).toBe('error');
            expect(streamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"This will fail"}]',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingErrorSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingErrorSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });

            const parsedChatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedChatCompletionSpan!.name).toBe('chat gpt-4o');
            expect(parsedChatCompletionSpan!.status).toBe('ok');
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(parsedChatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(parsedChatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the capital of France?"}]',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: '["Hello from OpenAI mock!"]',
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });

            const parsedResponsesSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedResponsesSpan!.name).toBe('chat gpt-4o');
            expect(parsedResponsesSpan!.status).toBe('ok');
            expect(parsedResponsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(parsedResponsesSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(parsedResponsesSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(parsedResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: 'What is the capital of France?',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: 'Response to: What is the capital of France?',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4o',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 13,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(8);
            const chatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-3.5-turbo',
            );
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });

            const streamingChatCompletionSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });

            const parsedChatCompletionSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(parsedChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });

            const parsedResponsesSpan = spans.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4o',
            );
            expect(parsedResponsesSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(parsedResponsesSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(parsedResponsesSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording disabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(4);
            const singleEmbeddingSpan = spans.find(
              span =>
                span.name === 'embeddings text-embedding-3-small' &&
                span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] !== undefined,
            );
            expect(singleEmbeddingSpan!.status).toBe('ok');
            expect(singleEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'float',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1536,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });

            const errorEmbeddingSpan = spans.find(span => span.name === 'embeddings error-model');
            expect(errorEmbeddingSpan!.status).toBe('error');
            expect(errorEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });

            const multiEmbeddingSpan = spans.find(
              span =>
                span.name === 'embeddings text-embedding-3-small' &&
                span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] === undefined,
            );
            expect(multiEmbeddingSpan!.status).toBe('ok');
            expect(multiEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });

            // GenAI inputs and outputs must never be recorded when `dataCollection.genAI` disables them.
            // Asserting over every span in the envelope catches attributes leaking onto
            // spans which are not individually inspected above.
            for (const span of spans) {
              expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(span.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
              expect(span.attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();
              expect(span.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBeUndefined();
            }

            const rawEmbeddingSpan = spans.find(span => span.name === 'embeddings text-embedding-3-large');
            expect(rawEmbeddingSpan!.status).toBe('ok');
            expect(rawEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(rawEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(rawEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-large',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeUndefined();
            expect(rawEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toBeUndefined();
            expect(rawEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording enabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(4);
            const singleEmbeddingSpan = spans.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Embedding test!',
            );
            expect(singleEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(singleEmbeddingSpan!.status).toBe('ok');
            expect(singleEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'float',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1536,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toEqual({
              type: 'string',
              value: 'Embedding test!',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });

            const errorEmbeddingSpan = spans.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Error embedding test!',
            );
            expect(errorEmbeddingSpan!.name).toBe('embeddings error-model');
            expect(errorEmbeddingSpan!.status).toBe('error');
            expect(errorEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toEqual({
              type: 'string',
              value: 'Error embedding test!',
            });

            const multiEmbeddingSpan = spans.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value ===
                '["First input text","Second input text","Third input text"]',
            );
            expect(multiEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(multiEmbeddingSpan!.status).toBe('ok');
            expect(multiEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toEqual({
              type: 'string',
              value: '["First input text","Second input text","Third input text"]',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });

            const rawEmbeddingSpan = spans.find(span => span.name === 'embeddings text-embedding-3-large');
            expect(rawEmbeddingSpan!.status).toBe('ok');
            expect(rawEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(rawEmbeddingSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(rawEmbeddingSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'text-embedding-3-large',
            });
            expect(rawEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeUndefined();
            expect(rawEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toBeUndefined();
            expect(rawEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
            expect(rawEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toEqual({
              type: 'string',
              value: 'Raw embedding test!',
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-root-span.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works without a wrapping span', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const serverSegment = allSpans.find(
              span => span.is_segment && span.name === 'POST /openai/chat/completions',
            );
            expect(serverSegment).toBeDefined();
            const segment = allSpans.find(span => span.is_segment && span.name === 'chat gpt-3.5-turbo');
            expect(segment?.span_id).toEqual(expect.any(String));
            expect(segment?.trace_id).toEqual(expect.any(String));
            expect(segment?.attributes[GEN_AI_OPERATION_NAME]).toEqual({ value: 'chat', type: 'string' });
            expect(segment?.attributes[SENTRY_OP]).toEqual({ value: 'gen_ai.chat', type: 'string' });
            expect(segment?.attributes[SENTRY_ORIGIN]).toEqual({ value: 'auto.ai.openai', type: 'string' });
            expect(segment?.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ value: 'openai', type: 'string' });
            expect(segment?.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ value: 'gpt-3.5-turbo', type: 'string' });
            expect(segment?.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({ value: 0.7, type: 'double' });
            expect(segment?.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({ value: 'gpt-3.5-turbo', type: 'string' });
            expect(segment?.attributes[GEN_AI_RESPONSE_ID]).toEqual({ value: 'chatcmpl-mock123', type: 'string' });
            expect(segment?.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({ value: '["stop"]', type: 'string' });
            expect(segment?.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ value: 10, type: 'integer' });
            expect(segment?.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ value: 15, type: 'integer' });
            expect(segment?.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ value: 25, type: 'integer' });
            expect(segment?.status).toEqual('ok');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-azure-openai.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works with Azure OpenAI', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const serverSegment = allSpans.find(
              span => span.is_segment && span.name === 'POST /azureopenai/deployments/:model/chat/completions',
            );
            expect(serverSegment).toBeDefined();
            const segment = allSpans.find(span => span.is_segment && span.name === 'chat gpt-3.5-turbo');
            expect(segment?.span_id).toEqual(expect.any(String));
            expect(segment?.trace_id).toEqual(expect.any(String));
            expect(segment?.attributes[GEN_AI_OPERATION_NAME]).toEqual({ value: 'chat', type: 'string' });
            expect(segment?.attributes[SENTRY_OP]).toEqual({ value: 'gen_ai.chat', type: 'string' });
            expect(segment?.attributes[SENTRY_ORIGIN]).toEqual({ value: 'auto.ai.openai', type: 'string' });
            expect(segment?.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ value: 'openai', type: 'string' });
            expect(segment?.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ value: 'gpt-3.5-turbo', type: 'string' });
            expect(segment?.attributes[GEN_AI_REQUEST_TEMPERATURE]).toEqual({ value: 0.7, type: 'double' });
            expect(segment?.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({ value: 'gpt-3.5-turbo', type: 'string' });
            expect(segment?.attributes[GEN_AI_RESPONSE_ID]).toEqual({ value: 'chatcmpl-mock123', type: 'string' });
            expect(segment?.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({ value: '["stop"]', type: 'string' });
            expect(segment?.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ value: 10, type: 'integer' });
            expect(segment?.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ value: 15, type: 'integer' });
            expect(segment?.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ value: 25, type: 'integer' });
            expect(segment?.status).toEqual('ok');
          },
        })
        .start()
        .completed();
    });
  });

  // Test for conversation ID support (Conversations API and previous_response_id)
  createEsmAndCjsTests(__dirname, 'scenario-conversation.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures conversation ID from Conversations API and previous_response_id', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'conversation-test');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(5);
            const conversationCreateSpan = spans.find(span => span.name === 'chat');
            expect(conversationCreateSpan!.status).toBe('ok');
            expect(conversationCreateSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(conversationCreateSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(conversationCreateSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(conversationCreateSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(conversationCreateSpan!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            const conversationResponseSpan = spans.find(
              span =>
                span.attributes[GEN_AI_CONVERSATION_ID]?.value ===
                  'conv_689667905b048191b4740501625afd940c7533ace33a2dab' &&
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4',
            );
            expect(conversationResponseSpan!.status).toBe('ok');
            expect(conversationResponseSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(conversationResponseSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(conversationResponseSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            const unlinkedResponseSpan = spans.find(
              span =>
                span.attributes[SENTRY_OP]?.value === 'gen_ai.chat' &&
                span.attributes[GEN_AI_CONVERSATION_ID] === undefined,
            );
            expect(unlinkedResponseSpan!.status).toBe('ok');
            expect(unlinkedResponseSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(unlinkedResponseSpan!.attributes[GEN_AI_CONVERSATION_ID]).toBeUndefined();

            const previousResponseSpan = spans.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'resp_mock_conv_123',
            );
            expect(previousResponseSpan!.status).toBe('ok');
            expect(previousResponseSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(previousResponseSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(previousResponseSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
              type: 'string',
              value: 'resp_mock_conv_123',
            });

            const rawConversationSpan = spans.find(
              span => span.name === 'chat' && span.attributes[GEN_AI_CONVERSATION_ID] === undefined,
            );
            expect(rawConversationSpan!.status).toBe('ok');
            expect(rawConversationSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(rawConversationSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(rawConversationSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(rawConversationSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(rawConversationSpan!.attributes[GEN_AI_CONVERSATION_ID]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  // Test for manual conversation ID setting using setConversationId()
  createEsmAndCjsTests(__dirname, 'scenario-manual-conversation-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('attaches manual conversation ID set via setConversationId() to all chat spans', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'chat-with-manual-conversation-id');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(3);

            // All three chat completion spans should have the same manually-set conversation ID
            for (const span of spans) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'user_chat_session_abc123',
              });
              expect(span!.attributes['gen_ai.provider.name']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['gen_ai.operation.name']).toEqual({ type: 'string', value: 'chat' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-1.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 1', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'GET /chat/conversation-1');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(2);

            // Both chat completion spans should have the expected conversation ID
            for (const span of spans) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'conv_user1_session_abc',
              });
              expect(span!.attributes['gen_ai.provider.name']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-2.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 2', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'GET /chat/conversation-2');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(2);

            // Both chat completion spans should have the expected conversation ID
            for (const span of spans) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'conv_user2_session_xyz',
              });
              expect(span!.attributes['gen_ai.provider.name']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
              expect(spans).toHaveLength(1);
              const [firstSpan] = spans;

              // [0] chat completion with system instructions extracted from messages
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toEqual({
                type: 'string',
                value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-with-response.mjs', 'instrument.mjs', (createRunner, test) => {
    test('preserves .withResponse() method and works correctly', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(2);

            for (const span of spans) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'chat' });
              expect(span!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ type: 'string', value: 'gpt-4' });
            }

            const parsedSpans = spans.filter(span => span.attributes[GEN_AI_RESPONSE_ID] !== undefined);
            expect(parsedSpans).toHaveLength(1);
            expect(parsedSpans[0]!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-withresponse',
            });

            const rawSpans = spans.filter(span => span.attributes[GEN_AI_RESPONSE_ID] === undefined);
            expect(rawSpans).toHaveLength(1);
            expect(rawSpans[0]!.attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();
            expect(rawSpans[0]!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });
});
