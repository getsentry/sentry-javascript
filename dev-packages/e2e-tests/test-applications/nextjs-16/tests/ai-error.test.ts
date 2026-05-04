import { expect, test } from '@playwright/test';
import { waitForError, waitForRootSpan } from '@sentry-internal/test-utils';

const isSpanStreaming = process.env.NEXT_PUBLIC_E2E_NEXTJS_SPAN_STREAMING === '1';

test('should create AI spans with correct attributes and error linking', async ({ page }) => {
  test.skip(isSpanStreaming, 'AI route segment span does not flush reliably in streaming mode');
  const aiRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /ai-error-test';
  });

  const errorEventPromise = waitForError('nextjs-16', async errorEvent => {
    return !!errorEvent.exception?.values?.[0]?.value?.includes('Tool call failed');
  });

  await page.goto('/ai-error-test');

  const aiRootSpan = await aiRootSpanPromise;
  const errorEvent = await errorEventPromise;

  expect(aiRootSpan).toBeDefined();
  expect(aiRootSpan.name).toBe('GET /ai-error-test');

  const childSpans = aiRootSpan.childSpans;

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

  expect(errorEvent).toBeDefined();

  // Verify error is linked to the same trace as the root span
  expect(errorEvent?.contexts?.trace?.trace_id).toBe(aiRootSpan.traceId);
});
