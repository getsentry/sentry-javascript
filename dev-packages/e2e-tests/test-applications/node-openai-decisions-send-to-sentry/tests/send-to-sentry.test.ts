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
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE, HTTP_SERVER } from '@sentry/conventions/op';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findSpanInTrace,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';

// Mirrors src/app.ts.
const MODEL = 'gpt-6-luna';

/**
 * What every decide span carries once Sentry has stored it, whatever the model answers. The names are the
 * stored ones: `span.op`, `span.status` and `origin` rather than the `sentry.*` attributes the SDK sends.
 * `span.description` stays empty: ingest only derives it for ops it knows, and `gen_ai.decide` is new.
 */
const DECIDE_SPAN_ATTRIBUTES = {
  'span.name': `decide ${MODEL}`,
  'span.op': GEN_AI_DECIDE,
  'span.status': 'ok',
  origin: 'auto.ai.openai',
  [GEN_AI_OPERATION_NAME]: 'decide',
  [GEN_AI_PROVIDER_NAME]: 'openai',
  [GEN_AI_REQUEST_MODEL]: MODEL,
  [GEN_AI_RESPONSE_MODEL]: MODEL,
};

test('records a text decision with its state, questions and answers', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/decide`);
  expect(response.status).toBe(200);
  const { traceId }: { traceId: string } = await response.json();

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  let attributes: Record<string, unknown> | undefined;
  await expect
    .poll(() => (attributes = fetchSpanAttributes(traceId, spanId!)), EVENT_POLLING_OPTIONS)
    .toMatchObject(DECIDE_SPAN_ATTRIBUTES);

  // Integers come back as strings. Decisions bills input tokens only, so there are no output tokens.
  expect(Number(attributes![GEN_AI_USAGE_OUTPUT_TOKENS])).toBe(0);
  expect(Number(attributes![GEN_AI_USAGE_INPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(attributes![GEN_AI_USAGE_TOTAL_TOKENS])).toBe(Number(attributes![GEN_AI_USAGE_INPUT_TOKENS]));

  // The request span is the segment; it ends last, so it can land after the decide span.
  await expect
    .poll(() => {
      const requestSpan = flattenTrace(fetchTrace(traceId)).find(item => item.op === HTTP_SERVER);
      return flattenTrace(requestSpan?.children ?? []).some(item => item.event_id === spanId);
    }, EVENT_POLLING_OPTIONS)
    .toBe(true);

  expect(JSON.parse(attributes![GEN_AI_INPUT_MESSAGES] as string)).toEqual([
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
  expect(JSON.parse(attributes![GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
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

test('records an image decision by media type only', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/decide-image`);
  expect(response.status).toBe(200);
  const { traceId }: { traceId: string } = await response.json();

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  let attributes: Record<string, unknown> | undefined;
  await expect
    .poll(() => (attributes = fetchSpanAttributes(traceId, spanId!)), EVENT_POLLING_OPTIONS)
    .toMatchObject(DECIDE_SPAN_ATTRIBUTES);

  expect(JSON.parse(attributes![GEN_AI_INPUT_MESSAGES] as string)).toEqual([
    {
      type: 'evaluation',
      state: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Is this image mostly red?' },
            { type: 'input_image', mime_type: 'image/png' },
          ],
        },
      ],
      questions: { is_red: { type: 'predicate', instructions: 'Is the image mostly red?' } },
    },
  ]);

  expect(JSON.parse(attributes![GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
    { type: 'evaluation', answers: { is_red: { type: 'predicate', probability: expect.any(Number) } } },
  ]);
});
