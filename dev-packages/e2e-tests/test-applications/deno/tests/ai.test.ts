import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create AI pipeline spans with Vercel AI SDK', async ({ baseURL }) => {
  const aiTransactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'ai-test') ?? false;
  });

  await fetch(`${baseURL}/test-ai`);

  const aiTransaction = await aiTransactionPromise;

  expect(aiTransaction).toBeDefined();

  const spans = aiTransaction.spans || [];

  // The parent span wrapping all AI calls should exist
  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'ai-test',
        op: 'function',
      }),
    ]),
  );

  // Vercel AI SDK emits OTel spans for generateText calls.
  // Due to the AI SDK monkey-patching limitation (https://github.com/vercel/ai/pull/6716),
  // only explicitly opted-in calls produce telemetry spans.
  // The explicitly enabled call (experimental_telemetry: { isEnabled: true }) should produce spans.
  const aiSpans = spans.filter(
    (span: any) =>
      span.op === 'gen_ai.invoke_agent' ||
      span.op === 'gen_ai.generate_text' ||
      span.op === 'otel.span' ||
      span.description?.includes('ai.generateText'),
  );

  // We expect at least one AI-related span from the explicitly enabled call
  expect(aiSpans.length).toBeGreaterThanOrEqual(1);

  // Verify the disabled call was not captured
  const promptsInSpans = spans
    .map((span: any) => span.data?.['vercel.ai.prompt'])
    .filter((prompt: unknown): prompt is string => prompt !== undefined);
  const hasDisabledPrompt = promptsInSpans.some((prompt: string) => prompt.includes('Where is the disabled span?'));
  expect(hasDisabledPrompt).toBe(false);
});
