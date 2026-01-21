import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_CHAT = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion without PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
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
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses API
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'resp_mock456',
          'gen_ai.response.finish_reasons': '["completed"]',
          'gen_ai.usage.input_tokens': 5,
          'gen_ai.usage.output_tokens': 8,
          'gen_ai.usage.total_tokens': 13,
          'openai.response.id': 'resp_mock456',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.response.timestamp': '2023-03-01T06:31:30.000Z',
          'openai.usage.completion_tokens': 8,
          'openai.usage.prompt_tokens': 5,
        },
        description: 'responses gpt-3.5-turbo',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
      // Fourth span - chat completions streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
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
          'gen_ai.response.streaming': true,
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 18,
          'openai.usage.prompt_tokens': 12,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fifth span - responses API streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_stream_456',
          'gen_ai.response.finish_reasons': '["in_progress","completed"]',
          'gen_ai.usage.input_tokens': 6,
          'gen_ai.usage.output_tokens': 10,
          'gen_ai.usage.total_tokens': 16,
          'openai.response.id': 'resp_stream_456',
          'openai.response.model': 'gpt-4',
          'gen_ai.response.streaming': true,
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 10,
          'openai.usage.prompt_tokens': 6,
        },
        description: 'responses gpt-4 stream-response',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Sixth span - error handling in streaming context
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.stream': true,
          'gen_ai.system': 'openai',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
        },
        description: 'chat error-model stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_CHAT = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.messages.original_length': 2,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the capital of France?"}]',
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
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses API with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.messages': 'Translate this to French: Hello',
          'gen_ai.response.text': 'Response to: Translate this to French: Hello',
          'gen_ai.response.finish_reasons': '["completed"]',
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.id': 'resp_mock456',
          'gen_ai.usage.input_tokens': 5,
          'gen_ai.usage.output_tokens': 8,
          'gen_ai.usage.total_tokens': 13,
          'openai.response.id': 'resp_mock456',
          'openai.response.model': 'gpt-3.5-turbo',
          'openai.response.timestamp': '2023-03-01T06:31:30.000Z',
          'openai.usage.completion_tokens': 8,
          'openai.usage.prompt_tokens': 5,
        },
        description: 'responses gpt-3.5-turbo',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - error handling with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
      // Fourth span - chat completions streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.stream': true,
          'gen_ai.request.messages.original_length': 2,
          'gen_ai.request.messages': '[{"role":"user","content":"Tell me about streaming"}]',
          'gen_ai.response.text': 'Hello from OpenAI streaming!',
          'gen_ai.response.finish_reasons': '["stop"]',
          'gen_ai.response.id': 'chatcmpl-stream-123',
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.usage.input_tokens': 12,
          'gen_ai.usage.output_tokens': 18,
          'gen_ai.usage.total_tokens': 30,
          'openai.response.id': 'chatcmpl-stream-123',
          'openai.response.model': 'gpt-4',
          'gen_ai.response.streaming': true,
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 18,
          'openai.usage.prompt_tokens': 12,
        }),
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fifth span - responses API streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages': 'Test streaming responses API',
          'gen_ai.response.text': 'Streaming response to: Test streaming responses APITest streaming responses API',
          'gen_ai.response.finish_reasons': '["in_progress","completed"]',
          'gen_ai.response.id': 'resp_stream_456',
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.usage.input_tokens': 6,
          'gen_ai.usage.output_tokens': 10,
          'gen_ai.usage.total_tokens': 16,
          'openai.response.id': 'resp_stream_456',
          'openai.response.model': 'gpt-4',
          'gen_ai.response.streaming': true,
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 10,
          'openai.usage.prompt_tokens': 6,
        }),
        description: 'responses gpt-4 stream-response',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Sixth span - error handling in streaming context with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
          'gen_ai.system': 'openai',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
        },
        description: 'chat error-model stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
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

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_CHAT })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_CHAT })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_EMBEDDINGS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - embeddings API
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'embeddings',
          'sentry.op': 'gen_ai.embeddings',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'text-embedding-3-small',
          'gen_ai.request.encoding_format': 'float',
          'gen_ai.request.dimensions': 1536,
          'gen_ai.response.model': 'text-embedding-3-small',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.total_tokens': 10,
          'openai.response.model': 'text-embedding-3-small',
          'openai.usage.prompt_tokens': 10,
        },
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - embeddings API error model
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'embeddings',
          'sentry.op': 'gen_ai.embeddings',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
        },
        description: 'embeddings error-model',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_EMBEDDINGS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - embeddings API with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'embeddings',
          'sentry.op': 'gen_ai.embeddings',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'text-embedding-3-small',
          'gen_ai.request.encoding_format': 'float',
          'gen_ai.request.dimensions': 1536,
          'gen_ai.request.messages': 'Embedding test!',
          'gen_ai.response.model': 'text-embedding-3-small',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.total_tokens': 10,
          'openai.response.model': 'text-embedding-3-small',
          'openai.usage.prompt_tokens': 10,
        },
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - embeddings API error model with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'embeddings',
          'sentry.op': 'gen_ai.embeddings',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': 'Error embedding test!',
        },
        description: 'embeddings error-model',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };
  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_EMBEDDINGS })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_EMBEDDINGS })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-root-span.mjs', 'instrument-root-span.mjs', (createRunner, test) => {
    test('it works without a wrapping span', async () => {
      await createRunner()
        // First the span that our mock express server is emitting, unrelated to this test
        .expect({
          transaction: {
            transaction: 'POST /openai/chat/completions',
          },
        })
        .expect({
          transaction: {
            transaction: 'chat gpt-3.5-turbo',
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
                data: {
                  'gen_ai.operation.name': 'chat',
                  'sentry.op': 'gen_ai.chat',
                  'sentry.origin': 'auto.ai.openai',
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
                op: 'gen_ai.chat',
                origin: 'auto.ai.openai',
                status: 'ok',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-azure-openai.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works with Azure OpenAI', async () => {
      await createRunner()
        // First the span that our mock express server is emitting, unrelated to this test
        .expect({
          transaction: {
            transaction: 'POST /azureopenai/deployments/:model/chat/completions',
          },
        })
        .expect({
          transaction: {
            transaction: 'chat gpt-3.5-turbo',
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
                data: {
                  'gen_ai.operation.name': 'chat',
                  'sentry.op': 'gen_ai.chat',
                  'sentry.origin': 'auto.ai.openai',
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
                op: 'gen_ai.chat',
                origin: 'auto.ai.openai',
                status: 'ok',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'truncation/scenario-message-truncation-completions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates messages when they exceed byte limit - keeps only last message and crops it', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
              spans: expect.arrayContaining([
                // First call: Last message is large and gets truncated (only C's remain, D's are cropped)
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'chat',
                    'sentry.op': 'gen_ai.chat',
                    'sentry.origin': 'auto.ai.openai',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.model': 'gpt-3.5-turbo',
                    // Messages should be present (truncation happened) and should be a JSON array of a single index
                    'gen_ai.request.messages': expect.stringMatching(/^\[\{"role":"user","content":"C+"\}\]$/),
                  }),
                  description: 'chat gpt-3.5-turbo',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
                // Second call: Last message is small and kept without truncation
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'chat',
                    'sentry.op': 'gen_ai.chat',
                    'sentry.origin': 'auto.ai.openai',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.model': 'gpt-3.5-turbo',
                    // Small message should be kept intact
                    'gen_ai.request.messages': JSON.stringify([
                      { role: 'user', content: 'This is a small message that fits within the limit' },
                    ]),
                  }),
                  description: 'chat gpt-3.5-turbo',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'truncation/scenario-message-truncation-responses.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates string inputs when they exceed byte limit', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
              spans: expect.arrayContaining([
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'responses',
                    'sentry.op': 'gen_ai.responses',
                    'sentry.origin': 'auto.ai.openai',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.model': 'gpt-3.5-turbo',
                    // Messages should be present and should include truncated string input (contains only As)
                    'gen_ai.request.messages': expect.stringMatching(/^A+$/),
                  }),
                  description: 'responses gpt-3.5-turbo',
                  op: 'gen_ai.responses',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'truncation/scenario-message-truncation-embeddings.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates messages when they exceed byte limit - keeps only last message and crops it', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
              spans: expect.arrayContaining([
                // First call: Single large string input truncated (only A's remain, B's are cropped)
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'embeddings',
                    'sentry.op': 'gen_ai.embeddings',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.messages': expect.stringMatching(/^A+$/),
                  }),
                  op: 'gen_ai.embeddings',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
                // Second call: Array input, last message truncated (only C's remain, D's are cropped)
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'embeddings',
                    'sentry.op': 'gen_ai.embeddings',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.messages': expect.stringMatching(/^\["C+"\]$/),
                  }),
                  op: 'gen_ai.embeddings',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
                // Third call: Array input with small last element - stored as JSON array
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'embeddings',
                    'sentry.op': 'gen_ai.embeddings',
                    'gen_ai.system': 'openai',
                    'gen_ai.request.messages': '["This is a small input that fits within the limit"]',
                  }),
                  op: 'gen_ai.embeddings',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );

  // Test for conversation ID support (Conversations API and previous_response_id)
  const EXPECTED_TRANSACTION_CONVERSATION = {
    transaction: 'conversation-test',
    spans: expect.arrayContaining([
      // First span - conversations.create returns conversation object with id
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'conversations',
          'sentry.op': 'gen_ai.conversations',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          // The conversation ID should be captured from the response
          'gen_ai.conversation.id': 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
        }),
        description: 'conversations unknown',
        op: 'gen_ai.conversations',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses.create with conversation parameter
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          // The conversation ID should be captured from the request
          'gen_ai.conversation.id': 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
        }),
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses.create without conversation (first in chain, should NOT have gen_ai.conversation.id)
      expect.objectContaining({
        data: expect.not.objectContaining({
          'gen_ai.conversation.id': expect.anything(),
        }),
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses.create with previous_response_id (chaining)
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          // The previous_response_id should be captured as conversation.id
          'gen_ai.conversation.id': 'resp_mock_conv_123',
        }),
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-conversation.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures conversation ID from Conversations API and previous_response_id', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_CONVERSATION })
        .start()
        .completed();
    });
  });
});
