import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat.sendMessage (should get model from context)
            expect(firstSpan!.name).toBe('chat gemini-1.5-pro');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.google_genai');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            // [1] models.generateContent
            expect(secondSpan!.name).toBe('generate_content gemini-1.5-flash');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-flash');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            // [2] error handling
            expect(thirdSpan!.name).toBe('generate_content error-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat.sendMessage with PII
            expect(firstSpan!.name).toBe('chat gemini-1.5-pro');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            // [1] models.generateContent with PII
            expect(secondSpan!.name).toBe('generate_content gemini-1.5-flash');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);

            // [2] error handling with PII
            expect(thirdSpan!.name).toBe('generate_content error-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat.sendMessage with custom options (PII enabled via recordInputs/recordOutputs)
            expect(firstSpan!.name).toBe('chat gemini-1.5-pro');
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();

            // [1] models.generateContent with custom options
            expect(secondSpan!.name).toBe('generate_content gemini-1.5-flash');

            // [2] error handling with custom options
            expect(thirdSpan!.name).toBe('generate_content error-model');
          },
        })
        .start()
        .completed();
    });
  });

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"name":"controlLight","parametersJsonSchema":{"type":"object","properties":{"brightness":{"type":"number"},"colorTemperature":{"type":"string"}},"required":["brightness","colorTemperature"]}}]';

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with tool calls', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] Non-streaming with tools
            expect(firstSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toBe(
              EXPECTED_AVAILABLE_TOOLS_JSON,
            );
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toBeUndefined();
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(23);

            // [1] Streaming with tools
            expect(secondSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toBe(
              EXPECTED_AVAILABLE_TOOLS_JSON,
            );
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('mock-response-tools-id');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-2.0-flash-001');
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(22);

            // [2] Without tools for comparison
            expect(thirdSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeUndefined();
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(thirdSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] models.generateContentStream (streaming)
            expect(firstSpan!.name).toBe('generate_content gemini-1.5-flash');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('mock-response-streaming-id');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(22);

            // [1] chat.sendMessageStream (streaming)
            expect(secondSpan!.name).toBe('chat gemini-1.5-pro');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('mock-response-streaming-id');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');

            // [2] blocked content streaming
            expect(thirdSpan!.name).toBe('generate_content blocked-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

            // [3] error handling for streaming
            expect(fourthSpan!.name).toBe('generate_content error-model');
            expect(fourthSpan!.status).toBe('error');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] models.generateContentStream (streaming) with PII
            expect(firstSpan!.name).toBe('generate_content gemini-1.5-flash');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');

            // [1] chat.sendMessageStream (streaming) with PII
            expect(secondSpan!.name).toBe('chat gemini-1.5-pro');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');

            // [2] blocked content stream with PII
            expect(thirdSpan!.name).toBe('generate_content blocked-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);

            // [3] error handling for streaming with PII
            expect(fourthSpan!.name).toBe('generate_content error-model');
            expect(fourthSpan!.status).toBe('error');
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
          },
        })
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
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const [firstSpan, secondSpan] = container.items;

              // [0] First call: Last message is large and gets truncated (only C's remain, D's are cropped)
              expect(firstSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","parts":\[\{"text":"C+"\}\]\}\]$/,
              );

              // [1] Second call: Last message is small and kept without truncation
              expect(secondSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([
                  {
                    role: 'user',
                    parts: [{ text: 'This is a small message that fits within the limit' }],
                  },
                ]),
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] generate_content with system instructions extracted
              expect(firstSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai embeddings spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] embedContent with string contents (no PII)
            expect(firstSpan!.name).toBe('embeddings text-embedding-004');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.google_genai');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('text-embedding-004');
            expect(firstSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBeUndefined();

            // [1] embedContent error model
            expect(secondSpan!.name).toBe('embeddings error-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');

            // [2] embedContent with array contents (no PII)
            expect(thirdSpan!.name).toBe('embeddings text-embedding-004');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai embeddings spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] embedContent with string contents and PII
            expect(firstSpan!.name).toBe('embeddings text-embedding-004');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(firstSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe(
              'What is the capital of France?',
            );

            // [1] embedContent error model with PII
            expect(secondSpan!.name).toBe('embeddings error-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe('This will fail');

            // [2] embedContent with array contents and PII
            expect(thirdSpan!.name).toBe('embeddings text-embedding-004');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe(
              '[{"role":"user","parts":[{"text":"First input text"}]},{"role":"user","parts":[{"text":"Second input text"}]}]',
            );
          },
        })
        .start()
        .completed();
    });
  });

  const longContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(
    __dirname,
    'scenario-no-truncation.mjs',
    'instrument-no-truncation.mjs',
    (createRunner, test) => {
      test('does not truncate input messages when enableTruncation is false', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] generate_content with full (non-truncated) input messages
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([
                  { role: 'user', parts: [{ text: longContent }] },
                  { role: 'model', parts: [{ text: 'Some reply' }] },
                  { role: 'user', parts: [{ text: 'Follow-up question' }] },
                ]),
              );
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
            },
          })
          .start()
          .completed();
      });
    },
  );

  const streamingLongContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(__dirname, 'scenario-span-streaming.mjs', 'instrument-streaming.mjs', (createRunner, test) => {
    test('automatically disables truncation when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongContent),
            );
            expect(chatSpan).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-span-streaming.mjs',
    'instrument-streaming-with-truncation.mjs',
    (createRunner, test) => {
      test('respects explicit enableTruncation: true even when span streaming is enabled', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;

              // With explicit enableTruncation: true, content should be truncated despite streaming.
              // Find the chat span by matching the start of the truncated content (the 'A' repeated messages).
              const chatSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith(
                  '[{"role":"user","parts":[{"text":"AAAA',
                ),
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );
});
