import { generateText, rerank } from 'ai';
import { MockLanguageModelV3, MockRerankingModelV3 } from 'ai/test';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

async function runAITest() {
  // Test generateText - uses V3 mock format for AI SDK v6
  const textResult = await generateText({
    experimental_telemetry: { isEnabled: true },
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'Generated text from v6!' }],
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        warnings: [],
      }),
    }),
    prompt: 'Test prompt for AI SDK v6',
  });

  // Test rerank - uses V3 mock format for AI SDK v6
  const rerankResult = await rerank({
    experimental_telemetry: { isEnabled: true },
    model: new MockRerankingModelV3({
      doRerank: async () => ({
        results: [
          { documentIndex: 1, relevanceScore: 0.95 },
          { documentIndex: 0, relevanceScore: 0.8 },
          { documentIndex: 2, relevanceScore: 0.6 },
        ],
        usage: { tokens: 50 },
        warnings: [],
      }),
    }),
    query: 'search query for reranking',
    documents: ['Document A', 'Document B', 'Document C'],
  });

  return {
    textResult: textResult.text,
    rerankResult: rerankResult.results.map(r => ({ score: r.relevanceScore, index: r.documentIndex })),
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
