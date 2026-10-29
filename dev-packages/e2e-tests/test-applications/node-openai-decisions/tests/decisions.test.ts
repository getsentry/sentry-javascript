import { expect, test } from '@playwright/test';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE, HTTP_SERVER } from '@sentry/conventions/op';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const APP = 'node-openai-decisions';

// Mirrors src/app.ts.
const MODEL = 'gpt-6-luna';

const attr = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

const isDecideSpan = (span: SerializedStreamedSpan, origin: string): boolean =>
  getSpanOp(span) === GEN_AI_DECIDE && attr(span, SENTRY_ORIGIN) === origin;

/**
 * Calls `path` and returns its decide span once the request span (the segment) has arrived as well. The
 * text and image decisions share an origin, so `inputMarker` tells their spans apart.
 */
async function requestDecideSpan(
  baseURL: string | undefined,
  path: string,
  origin: string,
  inputMarker: string,
): Promise<SerializedStreamedSpan> {
  const matches = (span: SerializedStreamedSpan): boolean =>
    isDecideSpan(span, origin) && String(attr(span, GEN_AI_INPUT_MESSAGES)).includes(inputMarker);
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => spansOfTrace.some(matches) && spansOfTrace.some(span => span.is_segment),
  );

  const response = await fetch(`${baseURL}${path}`);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);

  const spans = await spansPromise;
  const decideSpans = spans.filter(span => getSpanOp(span) === GEN_AI_DECIDE);
  expect(decideSpans).toHaveLength(1);
  const decideSpan = decideSpans[0]!;
  expect(decideSpan.trace_id).toBe(body.traceId);
  expect(getSpanOp(spans.find(span => span.is_segment)!)).toBe(HTTP_SERVER);

  return decideSpan;
}

/** What every decide span of the `openai` client carries, whatever the model answers. */
function expectOpenAiDecideSpan(span: SerializedStreamedSpan): void {
  expect(span.name).toBe(`decide ${MODEL}`);
  expect(span.status).toBe('ok');
  expect(attr(span, GEN_AI_OPERATION_NAME)).toBe('decide');
  expect(attr(span, GEN_AI_PROVIDER_NAME)).toBe('openai');
  expect(attr(span, GEN_AI_REQUEST_MODEL)).toBe(MODEL);
  expect(attr(span, GEN_AI_RESPONSE_MODEL)).toBe(MODEL);
}

test('records a text decision with its state, questions and answers', async ({ baseURL }) => {
  const span = await requestDecideSpan(baseURL, '/decide', 'auto.ai.openai', 'charged twice');

  expectOpenAiDecideSpan(span);

  // Decisions bills input tokens only, so there are no output tokens.
  expect(attr(span, GEN_AI_USAGE_OUTPUT_TOKENS)).toBe(0);
  expect(attr(span, GEN_AI_USAGE_INPUT_TOKENS)).toBeGreaterThan(0);
  expect(attr(span, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(attr(span, GEN_AI_USAGE_INPUT_TOKENS));

  expect(JSON.parse(attr(span, GEN_AI_INPUT_MESSAGES) as string)).toEqual([
    {
      type: 'evaluation',
      state: 'I was charged twice this month and want a refund.',
      questions: {
        wants_refund: { type: 'predicate', instructions: 'Is a refund requested?' },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: { billing: 'Charges and refunds', other: 'Anything else' },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is this ticket?',
          criteria: ['low', 'high'],
        },
      },
    },
  ]);

  // The answers depend on the model, the shape does not.
  expect(JSON.parse(attr(span, GEN_AI_OUTPUT_MESSAGES) as string)).toEqual([
    {
      type: 'evaluation',
      answers: {
        wants_refund: { type: 'predicate', probability: expect.any(Number) },
        department: {
          type: 'choice',
          choice: expect.stringMatching(/^(billing|other)$/),
          probabilities: { billing: expect.any(Number), other: expect.any(Number) },
          confidence: expect.any(Number),
        },
        urgency: {
          type: 'score',
          score: expect.any(Number),
          probabilities: { 0: expect.any(Number), 1: expect.any(Number) },
          legend: { 0: 'low', 1: 'high' },
          confidence: expect.any(Number),
        },
      },
    },
  ]);
});

test('records an image decision with its image data', async ({ baseURL }) => {
  const span = await requestDecideSpan(baseURL, '/decide-image', 'auto.ai.openai', 'mostly red');

  expectOpenAiDecideSpan(span);

  expect(JSON.parse(attr(span, GEN_AI_INPUT_MESSAGES) as string)).toEqual([
    {
      type: 'evaluation',
      state: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Is this image mostly red?' },
            { type: 'input_image', image_url: expect.stringMatching(/^data:image\/png;base64,/) },
          ],
        },
      ],
      questions: { is_red: { type: 'predicate', instructions: 'Is the image mostly red?' } },
    },
  ]);

  expect(JSON.parse(attr(span, GEN_AI_OUTPUT_MESSAGES) as string)).toEqual([
    { type: 'evaluation', answers: { is_red: { type: 'predicate', probability: expect.any(Number) } } },
  ]);
});

test('records a Vercel AI decision with the confidence of its answers', async ({ baseURL }) => {
  const span = await requestDecideSpan(baseURL, '/vercel-ai-decide', 'auto.ai.vercelai', 'charged twice');

  expect(span.name).toBe(`decide ${MODEL}`);
  expect(span.status).toBe('ok');
  expect(attr(span, GEN_AI_OPERATION_NAME)).toBe('decide');
  expect(attr(span, GEN_AI_PROVIDER_NAME)).toBe('openai.decision');
  expect(attr(span, GEN_AI_REQUEST_MODEL)).toBe(MODEL);

  expect(JSON.parse(attr(span, GEN_AI_INPUT_MESSAGES) as string)).toEqual([
    {
      type: 'evaluation',
      state: 'I was charged twice this month and want a refund.',
      questions: {
        wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: { billing: 'Charges and refunds', other: 'Anything else' },
        },
        urgency: { type: 'score', instructions: 'How urgent is this ticket?', criteria: ['low', 'high'] },
      },
    },
  ]);

  // The OpenAI provider moves `confidence` into its provider metadata; the span must keep it on the answers.
  expect(JSON.parse(attr(span, GEN_AI_OUTPUT_MESSAGES) as string)).toEqual([
    {
      type: 'evaluation',
      answers: {
        wantsRefund: { type: 'boolean', probability: expect.any(Number) },
        department: {
          type: 'choice',
          choice: expect.stringMatching(/^(billing|other)$/),
          probabilities: { billing: expect.any(Number), other: expect.any(Number) },
          confidence: expect.any(Number),
        },
        urgency: {
          type: 'score',
          score: expect.any(Number),
          probabilities: { 0: expect.any(Number), 1: expect.any(Number) },
          confidence: expect.any(Number),
        },
      },
    },
  ]);
});
