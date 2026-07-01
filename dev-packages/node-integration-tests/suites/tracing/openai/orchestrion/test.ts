import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// The origin distinguishes the orchestrion (diagnostics-channel) path from the
// OTel/proxy one (`auto.ai.openai`).
const ORCHESTRION_ORIGIN = 'auto.ai.orchestrion.openai';

describe('OpenAI integration (orchestrion)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, '../scenario-chat.mjs', 'instrument-orchestrion.mjs', (createRunner, test) => {
    test('creates openai chat spans via the diagnostics-channel path', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            const chatSpans = container.items.filter(
              span => span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.chat',
            );
            expect(chatSpans).toHaveLength(3);

            const chatSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
            );
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(chatSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.7,
            });
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });
            // Recording disabled: no inputs/outputs captured.
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeUndefined();

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            // `bindTracingChannelToSpan` sets the error status message to the OpenAI error's message,
            // so the serialized status is that message rather than the literal 'error' — just assert
            // the span was marked as errored.
            expect(errorSpan!.status).toBeDefined();
            expect(errorSpan!.status).not.toBe('ok');
            expect(errorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });

            const responsesSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_mock456',
            );
            expect(responsesSpan).toBeDefined();
            expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(responsesSpan!.status).toBe('ok');
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(responsesSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 13,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    '../scenario-chat.mjs',
    'instrument-orchestrion-with-pii.mjs',
    (createRunner, test) => {
      test('records inputs and outputs when PII is enabled', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const chatSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: ORCHESTRION_ORIGIN,
              });
              // System message is lifted out of `input_messages` into `system_instructions`.
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"What is the capital of France?"}]',
              });
              expect(chatSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
              });
              expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["Hello from OpenAI mock!"]',
              });

              const responsesSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_mock456',
              );
              expect(responsesSpan).toBeDefined();
              expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Translate this to French: Hello',
              });
              expect(responsesSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Response to: Translate this to French: Hello',
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, '../scenario-embeddings.mjs', 'instrument-orchestrion.mjs', (createRunner, test) => {
    test('creates openai embeddings spans via the diagnostics-channel path', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            const embeddingsSpans = container.items.filter(
              span => span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.embeddings',
            );
            expect(embeddingsSpans).toHaveLength(3);

            const singleEmbeddingSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]?.value === 1536,
            );
            expect(singleEmbeddingSpan).toBeDefined();
            expect(singleEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(singleEmbeddingSpan!.status).toBe('ok');
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'float',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });

            const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBeDefined();
            expect(errorSpan!.status).not.toBe('ok');
            expect(errorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
          },
        })
        .start()
        .completed();
    });
  });
});
