import { expect, test } from '@playwright/test';
import { waitForStreamedSpans } from '@sentry-internal/test-utils';

// gen_ai spans are emitted as a separate span-v2 envelope item (not inline on the transaction), so we
// assert on the streamed spans. Attribute values are wrapped as `{ value, type }` in the v2 format.
test('Instruments google-genai automatically via orchestrion', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-orchestrion', spans =>
    spans.some(span => span.attributes['sentry.origin']?.value === 'auto.ai.google_genai'),
  );

  await fetch(`${baseURL}/api/google-genai`);

  const spans = await spansPromise;

  const generateSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
  expect(generateSpan).toBeDefined();
  expect(generateSpan?.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
  expect(generateSpan?.attributes['sentry.origin']?.value).toBe('auto.ai.google_genai');
  expect(generateSpan?.attributes['gen_ai.system']?.value).toBe('google_genai');
  expect(generateSpan?.attributes['gen_ai.request.model']?.value).toBe('gemini-1.5-flash');
  expect(generateSpan?.attributes['gen_ai.usage.input_tokens']?.value).toBe(8);
  expect(generateSpan?.attributes['gen_ai.usage.output_tokens']?.value).toBe(12);
  expect(generateSpan?.attributes['gen_ai.usage.total_tokens']?.value).toBe(20);
});
