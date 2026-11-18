import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, expect, describe } from 'vitest';
import {
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
  GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { join } from 'node:path';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(join(__dirname, '../..'), 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording disabled', async () => {
      const runner = createRunner();
      const spansPromise = runner.collectStreamedSpansUntilSegment('main');

      await runner.start().completed();

      const allSpans = await spansPromise;
      const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
      expect(spans).toHaveLength(9);
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
        span => span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
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

      const geminiStreamSpan = spans.find(
        span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-gemini-456',
      );
      expect(geminiStreamSpan).toBeDefined();
      expect(geminiStreamSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBeUndefined();

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
      expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]?.value).toEqual(
        expect.any(Number),
      );

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
      expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]?.value).toEqual(
        expect.any(Number),
      );

      const streamingErrorSpan = spans.find(
        span => span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
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
    });
  });
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-chat.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates openai related spans with genAI recording enabled', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const allSpans = await spansPromise;
        const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(9);
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
          span => span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
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

        const geminiStreamSpan = spans.find(
          span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-gemini-456',
        );
        expect(geminiStreamSpan).toBeDefined();
        expect(geminiStreamSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
          type: 'string',
          value: JSON.stringify([
            { id: 'call_paris', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
            { id: 'call_london', type: 'function', function: { name: 'get_weather', arguments: '{"city":"London"}' } },
          ]),
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
          span => span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
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
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-chat.mjs',
    'instrument-with-options.mjs',
    (createRunner, test) => {
      test('creates openai related spans with custom options', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const allSpans = await spansPromise;
        const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(9);
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

        const geminiStreamSpan = spans.find(
          span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-gemini-456',
        );
        expect(geminiStreamSpan).toBeDefined();
        expect(geminiStreamSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
          type: 'string',
          value: JSON.stringify([
            { id: 'call_paris', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
            { id: 'call_london', type: 'function', function: { name: 'get_weather', arguments: '{"city":"London"}' } },
          ]),
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
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-azure-openai.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('it works with Azure OpenAI', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'chat gpt-3.5-turbo')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const segment = receivedSpans.find(span => span.is_segment && span.name === 'chat gpt-3.5-turbo');
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
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-with-response.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('preserves .withResponse() method and works correctly', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
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
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-stream-midway-error.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('marks the span as errored when the stream fails midway, but not when the caller breaks early', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
              expect(spans).toHaveLength(2);

              const midwaySpan = spans.find(span => span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'midway-error');
              expect(midwaySpan!.status).toBe('error');
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_ID]?.value).toBe('chatcmpl-midway');
              expect(midwaySpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('This stream will be cut off');

              const earlyBreakSpan = spans.find(span => span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'early-break');
              expect(earlyBreakSpan!.status).toBe('ok');
              expect(earlyBreakSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('This stream will ');
            },
          })
          .start()
          .completed();
      });
    },
  );
  createEsmAndCjsTests(join(__dirname, '../..'), 'scenario-abort.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ends a call the caller aborts as cancelled, but an SDK timeout as an error', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(4);
            const statusByModel = Object.fromEntries(
              spans.map(span => [span.attributes[GEN_AI_REQUEST_MODEL]?.value, span.status]),
            );
            // Span streaming sends `cancelled` as `ok`.
            expect(statusByModel).toEqual({
              'abort-before-stream': 'ok',
              'abort-non-streaming': 'ok',
              'timeout-before-stream': 'error',
              'timeout-non-streaming': 'error',
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
              const recordedById = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_RESPONSE_ID]?.value,
                  {
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                    outputs: GEN_AI_RESPONSE_TEXT in span.attributes,
                  },
                ]),
              );
              expect(recordedById).toEqual({
                'chatcmpl-public': { inputs: true, outputs: true },
                'chatcmpl-private': { inputs: false, outputs: false },
                'chatcmpl-public-stream': { inputs: true, outputs: false },
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks at start in the caller context and at end with the response', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
              const hooksById = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_RESPONSE_ID]?.value,
                  [span.attributes['test.start']?.value, span.attributes['test.end']?.value],
                ]),
              );
              expect(hooksById).toEqual({
                'chatcmpl-public': ['public:public', 'chatcmpl-public'],
                'chatcmpl-private': ['private:private', 'chatcmpl-private'],
                // A stream has no single response object, and its tag changes only after the call started.
                'chatcmpl-public-stream': ['public:private', 'no response'],
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
