import { expect, test } from '@playwright/test';
import {
  SEARCH_GEN_AI__INPUT__MESSAGES,
  SEARCH_GEN_AI__OPERATION__NAME,
  SEARCH_GEN_AI__OUTPUT__MESSAGES,
  SEARCH_GEN_AI__PROVIDER__NAME,
  SEARCH_GEN_AI__REQUEST__MODEL,
  SEARCH_GEN_AI__RESPONSE__MODEL,
  SEARCH_GEN_AI__USAGE__INPUT_TOKENS,
  SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS,
  SEARCH_GEN_AI__USAGE__TOTAL_TOKENS,
  SEARCH_ORIGIN,
  SEARCH_SPAN__OP,
  SEARCH_SPAN__STATUS,
} from '@sentry/conventions/attributes/search';
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
 * What every decide span carries once Sentry has stored it, whatever the model answers. The keys are the
 * search names, e.g. `span.op` and `origin` rather than the `sentry.*` attributes the SDK sends.
 * `span.description` stays empty: ingest only derives it for ops it knows, and `gen_ai.decide` is new.
 */
const DECIDE_SPAN_ATTRIBUTES = {
  'span.name': `decide ${MODEL}`,
  [SEARCH_SPAN__OP]: GEN_AI_DECIDE,
  [SEARCH_SPAN__STATUS]: 'ok',
  [SEARCH_ORIGIN]: 'auto.ai.openai',
  [SEARCH_GEN_AI__OPERATION__NAME]: 'decide',
  [SEARCH_GEN_AI__PROVIDER__NAME]: 'openai',
  [SEARCH_GEN_AI__REQUEST__MODEL]: MODEL,
  [SEARCH_GEN_AI__RESPONSE__MODEL]: MODEL,
};

test('records a text decision with its state, questions and answers', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/decide`);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  const { traceId }: { traceId: string } = body;

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
  expect(Number(attributes![SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS])).toBe(0);
  expect(Number(attributes![SEARCH_GEN_AI__USAGE__INPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(attributes![SEARCH_GEN_AI__USAGE__TOTAL_TOKENS])).toBe(
    Number(attributes![SEARCH_GEN_AI__USAGE__INPUT_TOKENS]),
  );

  // The request span is the segment; it ends last, so it can land after the decide span.
  await expect
    .poll(() => {
      const requestSpan = flattenTrace(fetchTrace(traceId)).find(item => item.op === HTTP_SERVER);
      return flattenTrace(requestSpan?.children ?? []).some(item => item.event_id === spanId);
    }, EVENT_POLLING_OPTIONS)
    .toBe(true);

  expect(JSON.parse(attributes![SEARCH_GEN_AI__INPUT__MESSAGES] as string)).toEqual([
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
  expect(JSON.parse(attributes![SEARCH_GEN_AI__OUTPUT__MESSAGES] as string)).toEqual([
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
  const response = await fetch(`${baseURL}/decide-image`);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  const { traceId }: { traceId: string } = body;

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  let attributes: Record<string, unknown> | undefined;
  await expect
    .poll(() => (attributes = fetchSpanAttributes(traceId, spanId!)), EVENT_POLLING_OPTIONS)
    .toMatchObject(DECIDE_SPAN_ATTRIBUTES);

  expect(JSON.parse(attributes![SEARCH_GEN_AI__INPUT__MESSAGES] as string)).toEqual([
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

  expect(JSON.parse(attributes![SEARCH_GEN_AI__OUTPUT__MESSAGES] as string)).toEqual([
    { type: 'evaluation', answers: { is_red: { type: 'predicate', probability: expect.any(Number) } } },
  ]);
});

test('records a Vercel AI decision with the confidence of its answers', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/vercel-ai-decide`);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  const { traceId }: { traceId: string } = body;

  console.log(`Polling for gen_ai.decide span: sentry trace view ${traceTarget(traceId)}`);

  let spanId: string | undefined;
  await expect
    .poll(() => (spanId = findSpanInTrace(traceId, GEN_AI_DECIDE)?.event_id), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  let attributes: Record<string, unknown> | undefined;
  await expect
    .poll(() => (attributes = fetchSpanAttributes(traceId, spanId!)), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      'span.name': `decide ${MODEL}`,
      [SEARCH_SPAN__OP]: GEN_AI_DECIDE,
      [SEARCH_SPAN__STATUS]: 'ok',
      [SEARCH_ORIGIN]: 'auto.ai.vercelai',
      [SEARCH_GEN_AI__OPERATION__NAME]: 'decide',
      [SEARCH_GEN_AI__PROVIDER__NAME]: 'openai.decision',
      [SEARCH_GEN_AI__REQUEST__MODEL]: MODEL,
    });

  expect(JSON.parse(attributes![SEARCH_GEN_AI__INPUT__MESSAGES] as string)).toEqual([
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
  expect(JSON.parse(attributes![SEARCH_GEN_AI__OUTPUT__MESSAGES] as string)).toEqual([
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
