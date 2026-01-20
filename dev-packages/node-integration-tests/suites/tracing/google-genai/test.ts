import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
        },
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage (should get model from context)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro', // Should get from chat context
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        },
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        },
        description: 'models gemini-1.5-flash',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'error-model',
        },
        description: 'models error-model',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
          'gen_ai.request.messages': expect.stringMatching(
            /\[\{"role":"system","content":"You are a friendly robot who likes to be funny."\},/,
          ), // Should include history when recordInputs: true
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.messages': expect.any(String), // Should include message when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        }),
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        }),
        description: 'models gemini-1.5-flash',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
        }),
        description: 'models error-model',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
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
        description: expect.not.stringContaining('stream-response'), // Non-streaming span
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"name":"controlLight","parametersJsonSchema":{"type":"object","properties":{"brightness":{"type":"number"},"colorTemperature":{"type":"string"}},"required":["brightness","colorTemperature"]}}]';

  const EXPECTED_TRANSACTION_TOOLS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Non-streaming with tools
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-2.0-flash-001',
          'gen_ai.request.available_tools': EXPECTED_AVAILABLE_TOOLS_JSON,
          'gen_ai.request.messages': expect.any(String), // Should include contents
          'gen_ai.response.text': expect.any(String), // Should include response text
          'gen_ai.response.tool_calls': expect.any(String), // Should include tool calls
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 8,
          'gen_ai.usage.total_tokens': 23,
        }),
        description: 'models gemini-2.0-flash-001',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Streaming with tools
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-2.0-flash-001',
          'gen_ai.request.available_tools': EXPECTED_AVAILABLE_TOOLS_JSON,
          'gen_ai.request.messages': expect.any(String), // Should include contents
          'gen_ai.response.streaming': true,
          'gen_ai.response.text': expect.any(String), // Should include response text
          'gen_ai.response.tool_calls': expect.any(String), // Should include tool calls
          'gen_ai.response.id': 'mock-response-tools-id',
          'gen_ai.response.model': 'gemini-2.0-flash-001',
          'gen_ai.usage.input_tokens': 12,
          'gen_ai.usage.output_tokens': 10,
          'gen_ai.usage.total_tokens': 22,
        }),
        description: 'models gemini-2.0-flash-001 stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Without tools for comparison
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-2.0-flash-001',
          'gen_ai.request.messages': expect.any(String), // Should include contents
          'gen_ai.response.text': expect.any(String), // Should include response text
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        }),
        description: 'models gemini-2.0-flash-001',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with tool calls', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_TOOLS }).start().completed();
    });
  });

  const EXPECTED_TRANSACTION_STREAMING = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - models.generateContentStream (streaming)
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.response.streaming': true,
          'gen_ai.response.id': 'mock-response-streaming-id',
          'gen_ai.response.model': 'gemini-1.5-pro',
          'gen_ai.response.finish_reasons': '["STOP"]',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 22,
        }),
        description: 'models gemini-1.5-flash stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.create
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - chat.sendMessageStream (streaming)
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.response.streaming': true,
          'gen_ai.response.id': 'mock-response-streaming-id',
          'gen_ai.response.model': 'gemini-1.5-pro',
        }),
        description: 'chat gemini-1.5-pro stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - blocked content streaming
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
        }),
        description: 'models blocked-model stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
      // Fifth span - error handling for streaming
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
        }),
        description: 'models error-model stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_STREAMING_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - models.generateContentStream (streaming) with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
          'gen_ai.response.streaming': true,
          'gen_ai.response.id': 'mock-response-streaming-id',
          'gen_ai.response.model': 'gemini-1.5-pro',
          'gen_ai.response.finish_reasons': '["STOP"]',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 22,
        }),
        description: 'models gemini-1.5-flash stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.create
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - chat.sendMessageStream (streaming) with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.messages': expect.any(String), // Should include message when recordInputs: true
          'gen_ai.response.streaming': true,
          'gen_ai.response.id': 'mock-response-streaming-id',
          'gen_ai.response.model': 'gemini-1.5-pro',
          'gen_ai.response.finish_reasons': '["STOP"]',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 22,
        }),
        description: 'chat gemini-1.5-pro stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - blocked content stream with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'blocked-model',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
          'gen_ai.response.streaming': true,
        }),
        description: 'models blocked-model stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
      // Fifth span - error handling for streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
        }),
        description: 'models error-model stream-response',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: false', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_STREAMING }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_STREAMING_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-message-truncation.mjs',
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
                    'gen_ai.operation.name': 'models',
                    'sentry.op': 'gen_ai.models',
                    'sentry.origin': 'auto.ai.google_genai',
                    'gen_ai.system': 'google_genai',
                    'gen_ai.request.model': 'gemini-1.5-flash',
                    // Messages should be present (truncation happened) and should be a JSON array with parts
                    'gen_ai.request.messages': expect.stringMatching(
                      /^\[\{"role":"user","parts":\[\{"text":"C+"\}\]\}\]$/,
                    ),
                  }),
                  description: 'models gemini-1.5-flash',
                  op: 'gen_ai.models',
                  origin: 'auto.ai.google_genai',
                  status: 'ok',
                }),
                // Second call: Last message is small and kept without truncation
                expect.objectContaining({
                  data: expect.objectContaining({
                    'gen_ai.operation.name': 'models',
                    'sentry.op': 'gen_ai.models',
                    'sentry.origin': 'auto.ai.google_genai',
                    'gen_ai.system': 'google_genai',
                    'gen_ai.request.model': 'gemini-1.5-flash',
                    // Small message should be kept intact
                    'gen_ai.request.messages': JSON.stringify([
                      {
                        role: 'user',
                        parts: [{ text: 'This is a small message that fits within the limit' }],
                      },
                    ]),
                  }),
                  description: 'models gemini-1.5-flash',
                  op: 'gen_ai.models',
                  origin: 'auto.ai.google_genai',
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
});
