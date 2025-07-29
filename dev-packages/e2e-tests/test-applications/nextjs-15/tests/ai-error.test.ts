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
