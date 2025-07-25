import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion without PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'chatcmpl-mock123',
          'gen_ai.response.finish_reasons': '["stop"]',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
          'openai.response.id': 'chatcmpl-mock123',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.response.timestamp': '2023-03-01T06:31:28.000Z',
          'openai.usage.completion_tokens': 15,
          'openai.usage.prompt_tokens': 10,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Second span - responses API
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'resp_mock456',
          'gen_ai.usage.input_tokens': 5,
          'gen_ai.usage.output_tokens': 8,
          'gen_ai.usage.total_tokens': 13,
          'openai.response.id': 'resp_mock456',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.usage.completion_tokens': 8,
          'openai.usage.prompt_tokens': 5,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Third span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'unknown_error',
      }),
      // Fourth span - chat completions streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.stream': true,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'chatcmpl-stream-123',
          'gen_ai.response.finish_reasons': '["stop"]',
          'gen_ai.usage.input_tokens': 12,
          'gen_ai.usage.output_tokens': 18,
          'gen_ai.usage.total_tokens': 30,
          'openai.response.id': 'chatcmpl-stream-123',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 18,
          'openai.usage.prompt_tokens': 12,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Fifth span - responses API streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_stream_456',
          'gen_ai.response.finish_reasons': '["in_progress"]',
          'gen_ai.usage.input_tokens': 0,
          'gen_ai.usage.output_tokens': 0,
          'gen_ai.usage.total_tokens': 0,
          'openai.response.id': 'resp_stream_456',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 0,
          'openai.usage.prompt_tokens': 0,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.messages':
            '[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is the capital of France?"}]',
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'chatcmpl-mock123',
          'gen_ai.response.finish_reasons': '["stop"]',
          'gen_ai.response.text': '["Hello from OpenAI mock!"]',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
          'openai.response.id': 'chatcmpl-mock123',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.response.timestamp': '2023-03-01T06:31:28.000Z',
          'openai.usage.completion_tokens': 15,
          'openai.usage.prompt_tokens': 10,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Second span - responses API with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.messages': '"Translate this to French: Hello"',
          'gen_ai.response.text': 'Response to: Translate this to French: Hello',
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'resp_mock456',
          'gen_ai.usage.input_tokens': 5,
          'gen_ai.usage.output_tokens': 8,
          'gen_ai.usage.total_tokens': 13,
          'openai.response.id': 'resp_mock456',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.usage.completion_tokens': 8,
          'openai.usage.prompt_tokens': 5,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Third span - error handling with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'unknown_error',
      }),
      // Fourth span - chat completions streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.stream': true,
          'gen_ai.request.messages':
            '[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"Tell me about streaming"}]',
          'gen_ai.response.text': 'Hello from OpenAI streaming!',
          'gen_ai.response.finish_reasons': '["stop"]',
          'gen_ai.response.id': 'chatcmpl-stream-123',
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.usage.input_tokens': 12,
          'gen_ai.usage.output_tokens': 18,
          'gen_ai.usage.total_tokens': 30,
          'openai.response.id': 'chatcmpl-stream-123',
          'openai.response.model': 'gpt-4',
          'openai.response.stream': true,
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 18,
          'openai.usage.prompt_tokens': 12,
        }),
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Fifth span - responses API streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages': '"Test streaming responses API"',
          'gen_ai.response.text': 'Streaming response to: Test streaming responses APITest streaming responses API',
          'gen_ai.response.finish_reasons': '["in_progress","completed"]',
          'gen_ai.response.id': 'resp_stream_456',
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.usage.input_tokens': 6,
          'gen_ai.usage.output_tokens': 10,
          'gen_ai.usage.total_tokens': 16,
          'openai.response.id': 'resp_stream_456',
          'openai.response.model': 'gpt-4',
          'openai.response.stream': true,
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 10,
          'openai.usage.prompt_tokens': 6,
        }),
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
      // Sixth span - error handling in streaming context with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
          'gen_ai.system': 'openai',
          'openai.response.stream': true,
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'manual',
        },
        description: 'chat error-model stream-response',
        op: 'gen_ai.chat',
        origin: 'manual',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_WITH_OPTIONS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Check that custom options are respected
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response text when recordOutputs: true
        }),
      }),
      // Check that custom options are respected for streaming
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response text when recordOutputs: true
          'gen_ai.request.stream': true, // Should be marked as stream
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });
});
