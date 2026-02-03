import { generateText, rerank } from 'ai';
import { MockLanguageModelV1, MockRerankingModelV1 } from 'ai/test';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

async function runAITest() {
  // Test generateText - should still work with AI SDK v6
  const textResult = await generateText({
    experimental_telemetry: { isEnabled: true },
    model: new MockLanguageModelV1({
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        text: 'Generated text from v6!',
      }),
    }),
    prompt: 'Test prompt for AI SDK v6',
  });

  // Test rerank - new feature in AI SDK v6
  const rerankResult = await rerank({
    experimental_telemetry: { isEnabled: true },
    model: new MockRerankingModelV1({
      doRerank: async () => ({
        ranking: [
          { originalIndex: 1, score: 0.95, document: 'Document B' },
          { originalIndex: 0, score: 0.8, document: 'Document A' },
          { originalIndex: 2, score: 0.6, document: 'Document C' },
        ],
      }),
    }),
    query: 'search query for reranking',
    documents: ['Document A', 'Document B', 'Document C'],
  });

  return {
    textResult: textResult.text,
    rerankResult: rerankResult.results.map(r => ({ score: r.score, document: r.document })),
  };
}

export default async function Page() {
  const results = await Sentry.startSpan({ op: 'function', name: 'ai-test' }, async () => {
    return await runAITest();
  });

  return (
    <div>
      <h1>AI SDK v6 Test Results</h1>
      <pre id="ai-results">{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
}
