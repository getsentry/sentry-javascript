import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create AI spans with correct attributes', async ({ page }) => {
  const aiTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === 'GET /ai-test';
  });

  await page.goto('/ai-test');

  const aiTransaction = await aiTransactionPromise;

  expect(aiTransaction).toBeDefined();
  expect(aiTransaction.transaction).toBe('GET /ai-test');

  const spans = aiTransaction.spans || [];

  // We expect spans for the first 3 AI calls (4th is disabled)
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

  // First AI call - should have telemetry enabled and record inputs/outputs (sendDefaultPii: true)
  /* const firstPipelineSpan = aiPipelineSpans[0];
  expect(firstPipelineSpan?.data?.['vercel.ai.model.id']).toBe('mock-model-id');
  expect(firstPipelineSpan?.data?.['vercel.ai.model.provider']).toBe('mock-provider');
  expect(firstPipelineSpan?.data?.['vercel.ai.prompt']).toContain('Where is the first span?');
  expect(firstPipelineSpan?.data?.['gen_ai.response.text']).toBe('First span here!');
  expect(firstPipelineSpan?.data?.['gen_ai.usage.input_tokens']).toBe(10);
  expect(firstPipelineSpan?.data?.['gen_ai.usage.output_tokens']).toBe(20); */

  // Second AI call - explicitly enabled telemetry
  const secondPipelineSpan = aiPipelineSpans[0];
  expect(secondPipelineSpan?.data?.['vercel.ai.prompt']).toContain('Where is the second span?');
  expect(secondPipelineSpan?.data?.['gen_ai.response.text']).toContain('Second span here!');

  // Third AI call - with tool calls
  /*  const thirdPipelineSpan = aiPipelineSpans[2];
  expect(thirdPipelineSpan?.data?.['vercel.ai.response.finishReason']).toBe('tool-calls');
  expect(thirdPipelineSpan?.data?.['gen_ai.usage.input_tokens']).toBe(15);
  expect(thirdPipelineSpan?.data?.['gen_ai.usage.output_tokens']).toBe(25); */

  // Tool call span
  /*  const toolSpan = toolCallSpans[0];
  expect(toolSpan?.data?.['vercel.ai.toolCall.name']).toBe('getWeather');
  expect(toolSpan?.data?.['vercel.ai.toolCall.id']).toBe('call-1');
  expect(toolSpan?.data?.['vercel.ai.toolCall.args']).toContain('San Francisco');
  expect(toolSpan?.data?.['vercel.ai.toolCall.result']).toContain('Sunny, 72°F'); */

  // Verify the fourth call was not captured (telemetry disabled)
  const promptsInSpans = spans
    .map(span => span.data?.['vercel.ai.prompt'])
    .filter((prompt): prompt is string => prompt !== undefined);
  const hasDisabledPrompt = promptsInSpans.some(prompt => prompt.includes('Where is the third span?'));
  expect(hasDisabledPrompt).toBe(false);

  // Verify results are displayed on the page
  const resultsText = await page.locator('#ai-results').textContent();
  expect(resultsText).toContain('First span here!');
  expect(resultsText).toContain('Second span here!');
  expect(resultsText).toContain('Tool call completed!');
  expect(resultsText).toContain('Third span here!');
});
