import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

const ORIGIN = 'auto.ai.together_ai';

// together-ai 1.x defines `create` on `BaseCompletions`/`BaseEmbeddings` (`Completions`/`Embeddings` are now
// empty subclasses), which needs its own orchestrion config entry. Attribute extraction is version-independent
// and covered by the suite pinned to 0.x; this one guards that each instrumented method still gets a span.
describe('Together integration (1.x)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments chat completions and embeddings on together-ai 1.x', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
        expect(spans.map(span => span.name).sort()).toEqual([
          'chat error-model',
          'chat meta-llama/Llama-3.1-8B-Instruct-Turbo',
          'chat meta-llama/Llama-3.3-70B-Instruct-Turbo',
          'embeddings togethercomputer/m2-bert-80M-8k-retrieval',
        ]);
        for (const span of spans) {
          expect(span.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('together_ai');
        }

        const chatSpan = spans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
        expect(chatSpan!.status).toBe('ok');
        expect(chatSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.chat');
        expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(25);

        const errorSpan = spans.find(span => span.name === 'chat error-model');
        expect(errorSpan!.status).toBe('error');

        const streamSpan = spans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123');
        expect(streamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
        expect(streamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);

        const embeddingsSpan = spans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'embd-mock123');
        expect(embeddingsSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.embeddings');
        expect(embeddingsSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('embeddings');
      });
    },
    { additionalDependencies: { 'together-ai': '1.0.0' } },
  );
});
