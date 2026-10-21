import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('should create AI pipeline spans with Vercel AI SDK', async ({ baseURL }) => {
  // The `ai-test` span wraps all AI calls, so once the trace's segment has arrived every AI span has too.
  const spansPromise = collectStreamedSpans(
    'deno',
    spans => spans.some(span => span.name === 'ai-test') && spans.some(span => span.is_segment),
  );

  await fetch(`${baseURL}/test-ai`);

  const spans = await spansPromise;

  // The parent span wrapping all AI calls should exist
  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'ai-test',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
        }),
      }),
    ]),
  );

  // Vercel AI SDK emits OTel spans for generateText calls.
  // Due to the AI SDK monkey-patching limitation (https://github.com/vercel/ai/pull/6716),
  // only explicitly opted-in calls produce telemetry spans.
  // The explicitly enabled call (experimental_telemetry: { isEnabled: true }) should produce spans.
  const aiSpans = spans.filter(span => {
    const op = getSpanOp(span);
    if (op === 'gen_ai.invoke_agent' || op === 'gen_ai.generate_content' || op === 'gen_ai.execute_tool') {
      return true;
    }
    // Processed Vercel AI spans (incl. cases where OTel kind no longer maps to a generic `op`)
    if (span.attributes['sentry.origin']?.value === 'auto.vercelai.otel') {
      return true;
    }
    // Raw Vercel AI OTel span names / attributes before or without full Sentry mapping
    if (span.name.startsWith('ai.')) {
      return true;
    }
    if (span.attributes['ai.operationId'] != null || span.attributes['gen_ai.pipeline.name'] != null) {
      return true;
    }
    return false;
  });

  // We expect at least one AI-related span from the explicitly enabled call
  expect(aiSpans.length).toBeGreaterThanOrEqual(1);

  // Verify the disabled call was not captured
  const promptsInSpans = spans
    .map(span => span.attributes['vercel.ai.prompt']?.value)
    .filter((prompt): prompt is string => typeof prompt === 'string');
  const hasDisabledPrompt = promptsInSpans.some(prompt => prompt.includes('Where is the disabled span?'));
  expect(hasDisabledPrompt).toBe(false);
});
