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
import type { TraceItem } from '@sentry-internal/test-utils/cli';
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

type Attributes = Record<string, unknown>;

/** Sends one request to the app and returns the trace its request span was recorded under. */
async function requestTrace(baseURL: string | undefined, path: string): Promise<string> {
  const response = await fetch(`${baseURL}${path}`);
  const body = await response.text();
  expect(response.status, `${path} answered ${response.status}: ${body}`).toBe(200);

  const { traceId } = JSON.parse(body) as { traceId?: string };
  expect(traceId, `${path} did not report a trace id: ${body}`).toMatch(/^[0-9a-f]{32}$/);

  console.log(`${path}: sentry trace view ${traceTarget(traceId!)}`);
  return traceId!;
}

/**
 * Polls Sentry until the trace holds a span with `op`, then returns that span and its attributes. The
 * trace endpoint only carries the span's op, name and place in the tree; the attributes need a second
 * lookup, which is polled as well since the two can land apart.
 */
async function waitForSpan(traceId: string, op: string): Promise<{ span: TraceItem; attributes: Attributes }> {
  let found: { span: TraceItem; attributes: Attributes } | undefined;

  await expect
    .poll(() => {
      const span = findSpanInTrace(traceId, op);
      const attributes = span?.event_id ? fetchSpanAttributes(traceId, span.event_id) : undefined;
      found = span && attributes ? { span, attributes } : undefined;
      return found;
    }, EVENT_POLLING_OPTIONS)
    .toBeDefined();

  return found!;
}

/**
 * The attributes every decide span carries once Sentry has stored it, whatever the model answers.
 * Note the names are the stored ones: `span.op`, `span.status` and `origin` rather than the `sentry.*`
 * attributes the SDK sends. Integers come back as strings. Decisions bills input tokens only, so there
 * are no output tokens.
 */
async function expectDecideSpan(traceId: string): Promise<Attributes> {
  const { span, attributes } = await waitForSpan(traceId, GEN_AI_DECIDE);

  expect(span.description).toBe(`decide ${MODEL}`);
  expect(attributes).toMatchObject({
    'span.op': GEN_AI_DECIDE,
    'span.status': 'ok',
    origin: 'auto.ai.openai',
    [GEN_AI_OPERATION_NAME]: 'decide',
    [GEN_AI_PROVIDER_NAME]: 'openai',
    [GEN_AI_REQUEST_MODEL]: MODEL,
    [GEN_AI_RESPONSE_MODEL]: MODEL,
  });
  expect(Number(attributes[GEN_AI_USAGE_OUTPUT_TOKENS])).toBe(0);
  expect(Number(attributes[GEN_AI_USAGE_INPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(attributes[GEN_AI_USAGE_TOTAL_TOKENS])).toBe(Number(attributes[GEN_AI_USAGE_INPUT_TOKENS]));

  const requestSpan = flattenTrace(fetchTrace(traceId)).find(item => item.op === HTTP_SERVER);
  expect(flattenTrace(requestSpan?.children ?? []).some(item => item.event_id === span.event_id)).toBe(true);

  return attributes;
}

test('records a text decision with its state, questions and answers', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/decide');
  const attributes = await expectDecideSpan(traceId);

  expect(JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string)).toEqual([
    {
      type: 'evaluation',
      state: 'I was charged twice this month and want a refund.',
      questions: [
        { type: 'predicate', name: 'wants_refund', instructions: 'Is a refund requested?' },
        {
          type: 'choice',
          name: 'department',
          instructions: 'Which team should handle this?',
          choices: [
            { value: 'billing', description: 'Charges and refunds' },
            { value: 'other', description: 'Anything else' },
          ],
        },
        {
          type: 'score',
          name: 'urgency',
          instructions: 'How urgent is this ticket?',
          levels: [{ label: 'low' }, { label: 'high' }],
        },
      ],
    },
  ]);

  // The probabilities depend on the model, the shape does not.
  expect(JSON.parse(attributes[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
    {
      type: 'evaluation',
      answers: [
        { type: 'predicate', name: 'wants_refund', probability: expect.any(Number) },
        {
          type: 'choice',
          name: 'department',
          choice: 'billing',
          probabilities: [
            { value: 'billing', probability: expect.any(Number) },
            { value: 'other', probability: expect.any(Number) },
          ],
          confidence: expect.any(Number),
        },
        {
          type: 'score',
          name: 'urgency',
          score: expect.any(Number),
          probabilities: [
            { value: 0, label: 'low', probability: expect.any(Number) },
            { value: 1, label: 'high', probability: expect.any(Number) },
          ],
          confidence: expect.any(Number),
        },
      ],
    },
  ]);
});

test('records an image decision by media type only', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/decide-image');
  const attributes = await expectDecideSpan(traceId);

  expect(JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string)).toEqual([
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
      questions: [{ type: 'predicate', name: 'is_red', instructions: 'Is the image mostly red?' }],
    },
  ]);

  expect(JSON.parse(attributes[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
    { type: 'evaluation', answers: [{ type: 'predicate', name: 'is_red', probability: expect.any(Number) }] },
  ]);
});
