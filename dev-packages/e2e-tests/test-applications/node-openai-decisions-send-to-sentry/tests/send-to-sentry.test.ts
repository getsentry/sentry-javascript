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
import type { TraceItem } from './utils/sentry-api';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findSpanInTrace,
  flattenTrace,
} from './utils/sentry-api';

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

  console.log(`${path}: https://${process.env.E2E_TEST_SENTRY_ORG_SLUG}.sentry.io/explore/traces/trace/${traceId}/`);
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
    .poll(async () => {
      const span = await findSpanInTrace(traceId, op);
      const attributes = span?.event_id ? await fetchSpanAttributes(traceId, span.event_id) : undefined;
      found = span && attributes ? { span, attributes } : undefined;
      return found;
    }, EVENT_POLLING_OPTIONS)
    .toBeDefined();

  return found!;
}

/**
 * The attributes every decide span carries once Sentry has stored it, whatever the model answers.
 * Note the names are the stored ones: `span.op`, `span.status` and `origin` rather than the `sentry.*`
 * attributes the SDK sends. Decisions bills input tokens only, so there are no output tokens.
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
    [GEN_AI_USAGE_OUTPUT_TOKENS]: 0,
  });
  expect(attributes[GEN_AI_USAGE_INPUT_TOKENS]).toBeGreaterThan(0);
  expect(attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(attributes[GEN_AI_USAGE_INPUT_TOKENS]);

  const requestSpan = flattenTrace(await fetchTrace(traceId)).find(item => item.op === HTTP_SERVER);
  expect(flattenTrace(requestSpan?.children ?? []).some(item => item.event_id === span.event_id)).toBe(true);

  return attributes;
}

test('records a text decision with its state, questions and answers', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/decide');
  const attributes = await expectDecideSpan(traceId);

  const [input] = JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string);
  expect(input).toMatchObject({ type: 'evaluation', state: expect.stringContaining('refund') });
  expect(input.questions.map((question: { name: string }) => question.name)).toEqual([
    'wants_refund',
    'department',
    'urgency',
  ]);

  const [output] = JSON.parse(attributes[GEN_AI_OUTPUT_MESSAGES] as string);
  expect(output.type).toBe('evaluation');
  expect(output.answers.map((answer: { type: string; name: string }) => [answer.type, answer.name])).toEqual([
    ['predicate', 'wants_refund'],
    ['choice', 'department'],
    ['score', 'urgency'],
  ]);
});

test('records an image decision by media type only', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/decide-image');
  const attributes = await expectDecideSpan(traceId);

  expect(attributes[GEN_AI_INPUT_MESSAGES]).not.toContain('base64');
  const [input] = JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string);
  expect(input.state).toEqual([
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Is this image mostly red?' },
        { type: 'input_image', mime_type: 'image/png' },
      ],
    },
  ]);
});
