import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create AI spans including rerank with correct attributes', async ({ page }) => {
  const aiTransactionPromise = waitForTransaction('nextjs-15-ai-v6', async transactionEvent => {
    return transactionEvent.transaction === 'GET /ai-test';
  });

  await page.goto('/ai-test');

  const aiTransaction = await aiTransactionPromise;

  expect(aiTransaction).toBeDefined();
  expect(aiTransaction.transaction).toBe('GET /ai-test');

  const spans = aiTransaction.spans || [];

  // Check for generateText spans
  const aiPipelineSpans = spans.filter(span => span.op === 'gen_ai.invoke_agent');
  const aiGenerateSpans = spans.filter(span => span.op === 'gen_ai.generate_text');

  // Check for rerank spans - the main feature being tested
  const rerankSpans = spans.filter(span => span.op === 'gen_ai.rerank');

  expect(aiPipelineSpans.length).toBeGreaterThanOrEqual(1);
  expect(aiGenerateSpans.length).toBeGreaterThanOrEqual(1);
  expect(rerankSpans.length).toBeGreaterThanOrEqual(1);

  // Verify generateText span has expected attributes
  const generatePipelineSpan = aiPipelineSpans.find(
    span => span.data?.['vercel.ai.prompt']?.includes('Test prompt for AI SDK v6'),
  );
  expect(generatePipelineSpan).toBeDefined();
  expect(generatePipelineSpan?.data?.['gen_ai.response.text']).toContain('Generated text from v6!');

  // Verify rerank span has expected attributes
  const rerankPipelineSpan = aiPipelineSpans.find(
    span => span.data?.['gen_ai.request.rerank.query']?.includes('search query for reranking'),
  );
  expect(rerankPipelineSpan).toBeDefined();
  expect(rerankPipelineSpan?.data?.['gen_ai.request.rerank.documents_count']).toBe(3);
  expect(rerankPipelineSpan?.data?.['gen_ai.response.rerank.top_score']).toBe(0.95);

  // Verify results are displayed on the page
  const resultsText = await page.locator('#ai-results').textContent();
  expect(resultsText).toContain('Generated text from v6!');
  expect(resultsText).toContain('Document B');
  expect(resultsText).toContain('0.95');
});
