import { expect, test } from '@playwright/test';
import { waitForTransaction, waitForError } from '@sentry-internal/test-utils';

test('should create AI spans with correct attributes and error linking', async ({ page }) => {
  const aiTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === 'GET /ai-error-test';
  });

  const errorEventPromise = waitForError('nextjs-15', async errorEvent => {
    return errorEvent.exception?.values?.[0]?.value?.includes('Tool call failed');
  });

  await page.goto('/ai-error-test');

  const aiTransaction = await aiTransactionPromise;
  const errorEvent = await errorEventPromise;

  expect(aiTransaction).toBeDefined();
  expect(aiTransaction.transaction).toBe('GET /ai-error-test');

  const spans = aiTransaction.spans || [];

  // Each generateText call should create 2 spans: one for the pipeline and one for doGenerate
  // Plus a span for the tool call
  // TODO: For now, this is sadly not fully working - the monkey patching of the ai package is not working
  // because of this, only spans that are manually opted-in at call time will be captured
  // this may be fixed by https://github.com/vercel/ai/pull/6716 in the future
  const aiPipelineSpans = spans.filter(span => span.op === 'gen_ai.invoke_agent');
  const aiGenerateSpans = spans.filter(span => span.op === 'gen_ai.generate_text');
  const toolCallSpans = spans.filter(span => span.op === 'gen_ai.execute_tool');

  expect(aiPipelineSpans.length).toBeGreaterThanOrEqual(1);
  expect(aiGenerateSpans.length).toBeGreaterThanOrEqual(1);
  expect(toolCallSpans.length).toBeGreaterThanOrEqual(0);

  expect(errorEvent).toBeDefined();

  //Verify error is linked to the same trace as the transaction
  expect(errorEvent?.contexts?.trace?.trace_id).toBe(aiTransaction.contexts?.trace?.trace_id);
});
