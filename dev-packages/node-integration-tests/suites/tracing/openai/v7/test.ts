import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
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
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const allSpans = await spansPromise;
        const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        expect(spans).toHaveLength(6);

        const chatCompletionSpan = spans.find(
          span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123',
        );
        expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
        expect(chatCompletionSpan!.status).toBe('ok');
        expect(chatCompletionSpan!.attributes[SENTRY_OP]).toEqual({
          type: 'string',
          value: 'gen_ai.chat',
        });
        expect(chatCompletionSpan!.attributes[SENTRY_ORIGIN]).toEqual({
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
        const responsesSpan = spans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_mock456');
        expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
        expect(responsesSpan!.status).toBe('ok');
        expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'chat' });
        expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
          type: 'string',
          value: 'gpt-3.5-turbo',
        });

        // Streaming goes through the patched async iterator rather than `beforeSpanEnd`, so it
        // is the part most likely to break if the `Stream` shape changes across a major.
        const streamingSpan = spans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123');
        expect(streamingSpan!.name).toBe('chat gpt-4');
        expect(streamingSpan!.status).toBe('ok');
        expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({ type: 'boolean', value: true });
        expect(streamingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 12 });
        expect(streamingSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ type: 'integer', value: 18 });
        expect(streamingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 30 });

        const errorSpan = spans.find(span => span.name === 'chat error-model' && span.status !== 'ok');
        expect(errorSpan!.attributes[SENTRY_ORIGIN]).toEqual({
          type: 'string',
          value: 'auto.ai.openai',
        });
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
        const embeddingSpans = spans.filter(span => span.attributes[GEN_AI_OPERATION_NAME]?.value === 'embeddings');
        expect(embeddingSpans).toHaveLength(3);

        const singleEmbeddingSpan = embeddingSpans.find(
          span => span.name === 'embeddings text-embedding-3-small' && span.status === 'ok',
        );
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

        const errorEmbeddingSpan = embeddingSpans.find(span => span.name === 'embeddings error-model');
        expect(errorEmbeddingSpan).toBeDefined();
        expect(errorEmbeddingSpan!.status).not.toBe('ok');
      });
    },
    {
      additionalDependencies: {
        openai: '7.5.0',
      },
    },
  );

  // The decisions API (`openai` >= 7.30.0) returns typed answers, so it is recorded like a Jev call.
  createEsmAndCjsTests(
    __dirname,
    'scenario-decisions.mjs',
    'instrument-with-recording.mjs',
    (createRunner, test) => {
      test('instruments the decisions API as decide spans', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE);
        expect(spans).toHaveLength(3);

        const [textSpan, imageSpan] = spans.filter(span => span.status === 'ok');
        expect(textSpan!.name).toBe('decide gpt-6-luna');
        expect(textSpan!.attributes).toMatchObject({
          [SENTRY_ORIGIN]: { value: 'auto.ai.openai' },
          [GEN_AI_OPERATION_NAME]: { value: 'decide' },
          [GEN_AI_PROVIDER_NAME]: { value: 'openai' },
          [GEN_AI_REQUEST_MODEL]: { value: 'gpt-6-luna' },
          [GEN_AI_RESPONSE_MODEL]: { value: 'gpt-6-luna-2026-09-01' },
          [GEN_AI_USAGE_INPUT_TOKENS]: { value: 120 },
          [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: { value: 40 },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 3 },
          [GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: { value: 0 },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { value: 123 },
        });
        expect(JSON.parse(textSpan!.attributes[GEN_AI_INPUT_MESSAGES]!.value as string)).toEqual([
          {
            type: 'evaluation',
            state: 'I was charged twice and want a refund.',
            questions: [
              { type: 'predicate', name: 'wants_refund', instructions: 'Is a refund requested?' },
              {
                type: 'choice',
                name: 'department',
                instructions: 'Which team should handle this?',
                choices: [{ value: 'billing' }, { value: 'other' }],
              },
              {
                type: 'score',
                name: 'urgency',
                instructions: 'How urgent is this ticket?',
                levels: [{ label: 'low' }, { label: 'high' }],
              },
            ],
          },
        ]);
        expect(JSON.parse(textSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]!.value as string)).toEqual([
          {
            type: 'evaluation',
            answers: [
              { type: 'predicate', name: 'wants_refund', probability: 0.97 },
              {
                type: 'choice',
                name: 'department',
                choice: 'billing',
                confidence: 0.82,
                probabilities: [
                  { value: 'billing', probability: 0.82 },
                  { value: 'other', probability: 0.18 },
                ],
              },
              { type: 'refusal', name: 'urgency' },
            ],
          },
        ]);

        // Images are base64 data URLs, so only their media type is recorded.
        expect(imageSpan!.attributes[GEN_AI_INPUT_MESSAGES]!.value).not.toContain('base64');
        expect(JSON.parse(imageSpan!.attributes[GEN_AI_INPUT_MESSAGES]!.value as string)[0].state).toEqual([
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Is the package damaged?' },
              { type: 'input_image', mime_type: 'image/png' },
            ],
          },
        ]);

        const errorSpan = spans.find(span => span.name === 'decide error-model');
        expect(errorSpan!.status).not.toBe('ok');
      });
    },
    {
      additionalDependencies: {
        openai: '7.30.0',
      },
    },
  );
});
