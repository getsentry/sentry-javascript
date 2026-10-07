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

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

const isEvaluateSpan = (span: SerializedStreamedSpan): boolean => getSpanOp(span) === GEN_AI_EVALUATE;
const isClassifyServerSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === HTTP_SERVER && String(attrValue(span, URL_FULL) ?? '').includes('/classify');

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
  expect(evaluateSpans.map(span => ({ name: span.name, origin: attrValue(span, SENTRY_ORIGIN) }))).toEqual([
    { name: 'evaluate typesafe/jev-1.13', origin: 'auto.ai.mastra' },
  ]);

  const evaluateSpan = evaluateSpans[0]!;
  expect(evaluateSpan.parent_span_id).toBe(serverSpan.span_id);
  expect(attrValue(evaluateSpan, GEN_AI_OPERATION_NAME)).toBe('evaluate');
  expect(attrValue(evaluateSpan, GEN_AI_REQUEST_MODEL)).toBe('typesafe/jev-1.13');
  expect(attrValue(evaluateSpan, GEN_AI_PROVIDER_NAME)).toBe('openrouter');
  expect(attrValue(evaluateSpan, GEN_AI_USAGE_INPUT_TOKENS)).toBeGreaterThan(0);
  expect(String(attrValue(evaluateSpan, GEN_AI_INPUT_MESSAGES))).toContain(TICKET);
  expect(String(attrValue(evaluateSpan, GEN_AI_OUTPUT_MESSAGES))).toContain('"is_bug"');
});
