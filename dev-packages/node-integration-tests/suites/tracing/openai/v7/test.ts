import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { conditionalTest } from '../../../../utils/index';

// openai 7 requires Node.js 22 — its only breaking change over v6 — so this suite is skipped on the
// Node 20 CI leg rather than pinning the whole matrix to the newer runtime.
conditionalTest({ min: 22 })('OpenAI integration (V7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // The per-attribute extraction is version-independent and already covered by the v4/v5 suite.
  // What a new major puts at risk is whether the transformer still matches the resource files at
  // all, so these assert that each instrumented `create` produces a span with the right shape.
  createEsmAndCjsTests(
    __dirname,
    'scenario-chat.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('instruments chat completions, the responses API and streaming on openai v7', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            span: container => {
              const chatCompletionSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123',
              );
              expect(chatCompletionSpan).toBeDefined();
              expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(chatCompletionSpan!.status).toBe('ok');
              expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
              expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
                type: 'string',
                value: '["stop"]',
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 10 });
              expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 25 });

              // The responses API is a separate instrumented resource file from chat completions.
              const responsesSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456',
              );
              expect(responsesSpan).toBeDefined();
              expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(responsesSpan!.status).toBe('ok');
              expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'chat' });
              expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });

              // Response streaming (`stream: true`) ends its span from the patched async iterator
              // rather than `beforeSpanEnd`, so it is the part most likely to break if openai's
              // `Stream` shape changes across a major.
              const streamingSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
              );
              expect(streamingSpan).toBeDefined();
              expect(streamingSpan!.name).toBe('chat gpt-4');
              expect(streamingSpan!.status).toBe('ok');
              expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({ type: 'boolean', value: true });
              expect(streamingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 12 });
              expect(streamingSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ type: 'integer', value: 18 });
              expect(streamingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 30 });

              const errorSpan = container.items.find(span => span.name === 'chat error-model' && span.status !== 'ok');
              expect(errorSpan).toBeDefined();
              expect(errorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        openai: '7.5.0',
      },
    },
  );

  // Embeddings publish to a different channel than chat, and match a resource file at the package
  // root rather than under a nested directory, so they need their own coverage.
  createEsmAndCjsTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('instruments the embeddings API on openai v7', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            span: container => {
              const embeddingSpans = container.items.filter(
                span => span.attributes[GEN_AI_OPERATION_NAME]?.value === 'embeddings',
              );
              expect(embeddingSpans).toHaveLength(3);

              const singleEmbeddingSpan = embeddingSpans.find(
                span => span.name === 'embeddings text-embedding-3-small' && span.status === 'ok',
              );
              expect(singleEmbeddingSpan).toBeDefined();
              expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(singleEmbeddingSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
                type: 'string',
                value: 'openai',
              });

              const errorEmbeddingSpan = embeddingSpans.find(span => span.name === 'embeddings error-model');
              expect(errorEmbeddingSpan).toBeDefined();
              expect(errorEmbeddingSpan!.status).not.toBe('ok');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        openai: '7.5.0',
      },
    },
  );
});
