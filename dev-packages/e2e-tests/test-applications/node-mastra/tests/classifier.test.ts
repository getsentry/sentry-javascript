import { expect, test } from '@playwright/test';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  SENTRY_ORIGIN,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { GEN_AI_EVALUATE, HTTP_SERVER } from '@sentry/conventions/op';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'node-mastra';
const TICKET = 'My checkout page shows a blank screen after I click Pay.';

const isEvaluateSpan = (span: SerializedStreamedSpan): boolean => getSpanOp(span) === GEN_AI_EVALUATE;
const isClassifyServerSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === HTTP_SERVER && String(span.attributes?.[URL_FULL]?.value ?? '').includes('/classify');

test('captures a Mastra classifier (Jev) evaluation as a gen_ai.evaluate span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => spansOfTrace.some(isEvaluateSpan) && spansOfTrace.some(isClassifyServerSpan),
  );

  const res = await fetch(`${baseURL}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket: TICKET }),
  });
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const serverSpan = spans.find(isClassifyServerSpan)!;

  // Only the Mastra exporter reports the evaluation: `Classifier` calls `doEvaluate()` directly, so the
  // Vercel AI integration does not see it.
  const evaluateSpans = spans.filter(isEvaluateSpan);
  expect(evaluateSpans.map(span => ({ name: span.name, origin: span.attributes?.[SENTRY_ORIGIN]?.value }))).toEqual([
    { name: 'evaluate typesafe/jev-1.13', origin: 'auto.ai.mastra' },
  ]);

  const evaluateSpan = evaluateSpans[0]!;
  expect(evaluateSpan.parent_span_id).toBe(serverSpan.span_id);
  expect(evaluateSpan.attributes?.[GEN_AI_OPERATION_NAME]?.value).toBe('evaluate');
  expect(evaluateSpan.attributes?.[GEN_AI_REQUEST_MODEL]?.value).toBe('typesafe/jev-1.13');
  expect(evaluateSpan.attributes?.[GEN_AI_PROVIDER_NAME]?.value).toBe('openrouter');
  expect(evaluateSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBeGreaterThan(0);
  expect(JSON.parse(String(evaluateSpan.attributes?.[GEN_AI_INPUT_MESSAGES]?.value))).toEqual([
    {
      type: 'evaluation',
      state: { ticket: TICKET },
      questions: {
        is_bug: { type: 'boolean', instructions: 'Is the customer reporting a software defect?' },
      },
    },
  ]);
  // The probability comes from the live model, so only its shape is stable.
  expect(JSON.parse(String(evaluateSpan.attributes?.[GEN_AI_OUTPUT_MESSAGES]?.value))).toEqual([
    { type: 'evaluation', answers: { is_bug: { type: 'boolean', probability: expect.any(Number) } } },
  ]);
});
