import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, expect, describe } from 'vitest';
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
} from '../../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { join } from 'node:path';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(join(__dirname, '../..'), 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with genAI recording disabled', async () => {
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
    });
  });
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-embeddings.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates openai related spans with genAI recording enabled', async () => {
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
      });
    },
  );
  createEsmAndCjsTests(join(__dirname, '../..'), 'scenario-root-span.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works without a wrapping span', async () => {
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
  });
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-conversation.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures the conversation ID from the Conversations API and ignores previous_response_id', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'conversation-test')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(5);
        const conversationCreateSpan = spans.find(
          span => span.name === 'chat' && span.attributes[GEN_AI_RESPONSE_ID] !== undefined,
        );
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

        // The unlinked call and the one chained with `previous_response_id` both carry no conversation id:
        // a response id names one response, not the thread, so chaining does not group spans.
        const unlinkedResponseSpans = spans.filter(
          span =>
            span.attributes[SENTRY_OP]?.value === 'gen_ai.chat' &&
            span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'gpt-4' &&
            span.attributes[GEN_AI_CONVERSATION_ID] === undefined,
        );
        expect(unlinkedResponseSpans).toHaveLength(2);
        for (const span of unlinkedResponseSpans) {
          expect(span.status).toBe('ok');
          expect(span.attributes[GEN_AI_RESPONSE_ID]).toEqual({ type: 'string', value: 'resp_mock_conv_123' });
        }
        expect(spans.some(span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'resp_mock_conv_123')).toBe(false);

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
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-manual-conversation-id.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('attaches manual conversation ID set via setConversationId() to all chat spans', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(
                container.items.find(span => span.is_segment && span.name === 'chat-with-manual-conversation-id'),
              ).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(3);

        // All three chat completion spans should have the same manually-set conversation ID
        for (const span of spans) {
          expect(span!.name).toBe('chat gpt-4');
          expect(span!.status).toBe('ok');
          expect(span!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
            type: 'string',
            value: 'user_chat_session_abc123',
          });
          expect(span!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
          expect(span!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ type: 'string', value: 'gpt-4' });
          expect(span!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'chat' });
          expect(span!.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
        }
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-separate-scope-1.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('isolates conversation IDs across separate scopes - conversation 1', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(
                container.items.find(span => span.is_segment && span.name === 'GET /chat/conversation-1'),
              ).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(2);

        // Both chat completion spans should have the expected conversation ID
        for (const span of spans) {
          expect(span!.name).toBe('chat gpt-4');
          expect(span!.status).toBe('ok');
          expect(span!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
            type: 'string',
            value: 'conv_user1_session_abc',
          });
          expect(span!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
          expect(span!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ type: 'string', value: 'gpt-4' });
          expect(span!.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
        }
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-separate-scope-2.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('isolates conversation IDs across separate scopes - conversation 2', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(
                container.items.find(span => span.is_segment && span.name === 'GET /chat/conversation-2'),
              ).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(2);

        // Both chat completion spans should have the expected conversation ID
        for (const span of spans) {
          expect(span!.name).toBe('chat gpt-4');
          expect(span!.status).toBe('ok');
          expect(span!.attributes[GEN_AI_CONVERSATION_ID]).toEqual({
            type: 'string',
            value: 'conv_user2_session_xyz',
          });
          expect(span!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
          expect(span!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({ type: 'string', value: 'gpt-4' });
          expect(span!.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
        }
      });
    },
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
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
        expect(spans).toHaveLength(1);
        const [firstSpan] = spans;

        // [0] chat completion with system instructions extracted from messages
        expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toEqual({
          type: 'string',
          value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
        });
      });
    },
  );
});
