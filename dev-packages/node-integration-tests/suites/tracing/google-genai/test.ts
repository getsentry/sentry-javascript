import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(chatSpan!.attributes['sentry.origin'].value).toBe('auto.ai.google_genai');
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            const generateContentSpan = container.items.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-flash');
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(errorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);

            const generateContentSpan = container.items.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);

            const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();

            const generateContentSpan = container.items.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');

            const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
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
            const nonStreamingToolsSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]?.value === EXPECTED_AVAILABLE_TOOLS_JSON &&
                span.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE] === undefined,
            );
            expect(nonStreamingToolsSpan).toBeDefined();
            expect(nonStreamingToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(nonStreamingToolsSpan!.status).toBe('ok');
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeDefined();
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(23);

            const streamingToolsSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]?.value === EXPECTED_AVAILABLE_TOOLS_JSON &&
                span.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]?.value === true,
            );
            expect(streamingToolsSpan).toBeDefined();
            expect(streamingToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(streamingToolsSpan!.status).toBe('ok');
            expect(streamingToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(streamingToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeDefined();
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('mock-response-tools-id');
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-2.0-flash-001');
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(22);

            const noToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] === undefined,
            );
            expect(noToolsSpan).toBeDefined();
            expect(noToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(noToolsSpan!.status).toBe('ok');
            expect(noToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(noToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(noToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content blocked-model',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const generateContentSpan = container.items.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe(
              'mock-response-streaming-id',
            );
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(22);

            const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('mock-response-streaming-id');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gemini-1.5-pro');

            const blockedSpan = container.items.find(span => span.name === 'generate_content blocked-model');
            expect(blockedSpan).toBeDefined();
            expect(blockedSpan!.status).toBe('error');
            expect(blockedSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(blockedSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');

            const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content blocked-model',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const generateContentSpan = container.items.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(generateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');

            const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["STOP"]');

            const blockedSpan = container.items.find(span => span.name === 'generate_content blocked-model');
            expect(blockedSpan).toBeDefined();
            expect(blockedSpan!.status).toBe('error');
            expect(blockedSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(blockedSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(blockedSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(blockedSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);

            const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
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
              const truncatedSpan = container.items.find(span =>
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.match(
                  /^\[\{"role":"user","parts":\[\{"text":"C+"\}\]\}\]$/,
                ),
              );
              expect(truncatedSpan).toBeDefined();
              expect(truncatedSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(truncatedSpan!.status).toBe('ok');
              expect(truncatedSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
              expect(truncatedSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              const smallMessageSpan = container.items.find(
                span =>
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                  JSON.stringify([
                    {
                      role: 'user',
                      parts: [{ text: 'This is a small message that fits within the limit' }],
                    },
                  ]),
              );
              expect(smallMessageSpan).toBeDefined();
              expect(smallMessageSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(smallMessageSpan!.status).toBe('ok');
              expect(smallMessageSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
              expect(smallMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
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
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-004',
              'embeddings text-embedding-004',
            ]);

            const successfulSpans = container.items.filter(
              span => span.name === 'embeddings text-embedding-004' && span.status === 'ok',
            );
            expect(successfulSpans).toHaveLength(2);
            for (const span of successfulSpans) {
              expect(span.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
              expect(span.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
              expect(span.attributes['sentry.origin'].value).toBe('auto.ai.google_genai');
              expect(span.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');
              expect(span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('text-embedding-004');
              expect(span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBeUndefined();
            }

            const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-004',
              'embeddings text-embedding-004',
            ]);

            const stringInputSpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'What is the capital of France?',
            );
            expect(stringInputSpan).toBeDefined();
            expect(stringInputSpan!.name).toBe('embeddings text-embedding-004');
            expect(stringInputSpan!.status).toBe('ok');
            expect(stringInputSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
            expect(stringInputSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('google_genai');

            const errorSpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'This will fail',
            );
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.name).toBe('embeddings error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');

            const arrayInputSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value ===
                '[{"role":"user","parts":[{"text":"First input text"}]},{"role":"user","parts":[{"text":"Second input text"}]}]',
            );
            expect(arrayInputSpan).toBeDefined();
            expect(arrayInputSpan!.name).toBe('embeddings text-embedding-004');
            expect(arrayInputSpan!.status).toBe('ok');
            expect(arrayInputSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
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
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
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
