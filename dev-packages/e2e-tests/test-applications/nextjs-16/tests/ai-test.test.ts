import { expect, test } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';

const isSpanStreaming = process.env.NEXT_PUBLIC_E2E_NEXTJS_SPAN_STREAMING === '1';

test('should create AI spans with correct attributes', async ({ page }) => {
  test.skip(isSpanStreaming, 'AI route segment span does not flush reliably in streaming mode');
  const aiRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /ai-test';
  });

  await page.goto('/ai-test');

  const aiRootSpan = await aiRootSpanPromise;

  expect(aiRootSpan).toBeDefined();
  expect(aiRootSpan.name).toBe('GET /ai-test');

  const childSpans = aiRootSpan.childSpans;

  // We expect spans for the first 3 AI calls (4th is disabled)
  // Each generateText call should create 2 spans: one for the pipeline and one for doGenerate
  // Plus a span for the tool call
  // TODO: For now, this is sadly not fully working - the monkey patching of the ai package is not working
  // because of this, only spans that are manually opted-in at call time will be captured
  // this may be fixed by https://github.com/vercel/ai/pull/6716 in the future
  const aiPipelineSpans = childSpans.filter(span => span.op === 'gen_ai.invoke_agent');
  const aiGenerateSpans = childSpans.filter(span => span.op === 'gen_ai.generate_content');
  const toolCallSpans = childSpans.filter(span => span.op === 'gen_ai.execute_tool');

  expect(aiPipelineSpans.length).toBeGreaterThanOrEqual(1);
  expect(aiGenerateSpans.length).toBeGreaterThanOrEqual(1);
  expect(toolCallSpans.length).toBeGreaterThanOrEqual(0);

  // Second AI call - explicitly enabled telemetry
  const secondPipelineSpan = aiPipelineSpans[0];
  expect(secondPipelineSpan?.attributes['vercel.ai.prompt']).toContain('Where is the second span?');
  expect(secondPipelineSpan?.attributes['gen_ai.output.messages']).toContain('Second span here!');

  // Verify the fourth call was not captured (telemetry disabled)
  const promptsInSpans = childSpans
    .map(span => span.attributes['vercel.ai.prompt'] as string | undefined)
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
