import { expect, test } from '@playwright/test';
import {
  SEARCH_GEN_AI__EMBEDDINGS__INPUT,
  SEARCH_GEN_AI__INPUT__MESSAGES,
  SEARCH_GEN_AI__OPERATION__NAME,
  SEARCH_GEN_AI__OUTPUT__MESSAGES,
  SEARCH_GEN_AI__PROVIDER__NAME,
  SEARCH_GEN_AI__REQUEST__MODEL,
  SEARCH_GEN_AI__REQUEST__TEMPERATURE,
  SEARCH_GEN_AI__RESPONSE__FINISH_REASONS,
  SEARCH_GEN_AI__RESPONSE__MODEL,
  SEARCH_GEN_AI__RESPONSE__STREAMING,
  SEARCH_GEN_AI__SYSTEM_INSTRUCTIONS,
  SEARCH_GEN_AI__TOOL__DEFINITIONS,
  SEARCH_GEN_AI__USAGE__INPUT_TOKENS,
  SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS,
  SEARCH_GEN_AI__USAGE__TOTAL_TOKENS,
  SEARCH_ORIGIN,
  SEARCH_SPAN__OP,
  SEARCH_SPAN__STATUS,
} from '@sentry/conventions/attributes/search';
import { GEN_AI_CHAT, GEN_AI_EMBEDDINGS, GEN_AI_GENERATE_CONTENT, HTTP_SERVER } from '@sentry/conventions/op';
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
const MODEL = 'google/gemini-2.5-flash-lite';
const EMBEDDINGS_MODEL = 'google/gemini-embedding-001';

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

/** The ids of the spans with `op` below the request span of the trace. */
function spanIdsUnderRequestSpan(traceId: string, op: string): string[] {
  const requestSpan = flattenTrace(fetchTrace(traceId)).find(item => item.op === HTTP_SERVER);
  return flattenTrace(requestSpan?.children ?? [])
    .filter(item => item.op === op)
    .map(item => item.event_id!);
}

/**
 * The request span is the segment; it ends last, so it can land after its children. Expecting exactly
 * one span also catches the call being instrumented twice.
 */
async function expectOnlySpanUnderRequestSpan(traceId: string, op: string, span: TraceItem): Promise<void> {
  await expect.poll(() => spanIdsUnderRequestSpan(traceId, op), EVENT_POLLING_OPTIONS).toEqual([span.event_id]);
}

/**
 * The attributes every successful model-call span carries once Sentry has stored it, whatever the
 * model answers. The keys are the search names, e.g. `span.op` and `origin` rather than the `sentry.*`
 * attributes the SDK sends.
 */
function expectModelCallAttributes(
  span: TraceItem,
  attributes: Attributes,
  op: string,
  operation: 'chat' | 'generate_content' | 'embeddings',
  model: string,
): void {
  expect(span.description).toBe(`${operation} ${model}`);
  expect(attributes).toMatchObject({
    [SEARCH_SPAN__OP]: op,
    [SEARCH_SPAN__STATUS]: 'ok',
    [SEARCH_ORIGIN]: 'auto.ai.google_genai',
    [SEARCH_GEN_AI__OPERATION__NAME]: operation,
    [SEARCH_GEN_AI__PROVIDER__NAME]: 'google_genai',
    [SEARCH_GEN_AI__REQUEST__MODEL]: model,
  });
}

/** What every content-producing call reports back. The Sentry API returns int attributes as strings. */
function expectResponseAttributes(attributes: Attributes): void {
  expect(typeof attributes[SEARCH_GEN_AI__RESPONSE__MODEL]).toBe('string');
  expect(Number(attributes[SEARCH_GEN_AI__USAGE__INPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(attributes[SEARCH_GEN_AI__USAGE__OUTPUT_TOKENS])).toBeGreaterThan(0);
  expect(Number(attributes[SEARCH_GEN_AI__USAGE__TOTAL_TOKENS])).toBeGreaterThan(0);
}

/** The SDK records prompts and answers by default, and they have to survive the trip to Sentry. */
function expectRecordedConversation(attributes: Attributes): void {
  expect(Number(attributes[SEARCH_GEN_AI__REQUEST__TEMPERATURE])).toBe(0);
  expect(attributes[SEARCH_GEN_AI__SYSTEM_INSTRUCTIONS]).toContain('automated test');
  expect(attributes[SEARCH_GEN_AI__INPUT__MESSAGES]).toContain('capital of France');
  expect(attributes[SEARCH_GEN_AI__OUTPUT__MESSAGES]).toMatch(/paris/i);
}

test('Sends generateContent to Sentry as a gen_ai.generate_content span under the request span', async ({
  baseURL,
}) => {
  const traceId = await requestTrace(baseURL, '/generate');

  const { span, attributes } = await waitForSpan(traceId, GEN_AI_GENERATE_CONTENT);

  expectModelCallAttributes(span, attributes, GEN_AI_GENERATE_CONTENT, 'generate_content', MODEL);
  expectResponseAttributes(attributes);
  expect(attributes[SEARCH_GEN_AI__RESPONSE__STREAMING]).toBeUndefined();
  expectRecordedConversation(attributes);

  await expectOnlySpanUnderRequestSpan(traceId, GEN_AI_GENERATE_CONTENT, span);
});

test('Sends generateContentStream to Sentry with its token usage', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/generate-stream');

  const { span, attributes } = await waitForSpan(traceId, GEN_AI_GENERATE_CONTENT);

  expectModelCallAttributes(span, attributes, GEN_AI_GENERATE_CONTENT, 'generate_content', MODEL);
  // The usage only arrives in the last chunks, which the streaming instrumentation has to pick up.
  expectResponseAttributes(attributes);
  expect(attributes[SEARCH_GEN_AI__RESPONSE__STREAMING]).toBe(true);
  // Finish reasons are only recorded for streamed calls.
  expect(JSON.parse(attributes[SEARCH_GEN_AI__RESPONSE__FINISH_REASONS] as string)).toContain('STOP');
  expectRecordedConversation(attributes);

  await expectOnlySpanUnderRequestSpan(traceId, GEN_AI_GENERATE_CONTENT, span);
});

test('Sends a chat message to Sentry with the config given to chats.create()', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/chat');

  const { span, attributes } = await waitForSpan(traceId, GEN_AI_CHAT);

  expectModelCallAttributes(span, attributes, GEN_AI_CHAT, 'chat', MODEL);
  expectResponseAttributes(attributes);
  expectRecordedConversation(attributes);

  await expectOnlySpanUnderRequestSpan(traceId, GEN_AI_CHAT, span);
});

test('Sends a generateContent call that returned a function call to Sentry', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/tools');

  const { span, attributes } = await waitForSpan(traceId, GEN_AI_GENERATE_CONTENT);

  expectModelCallAttributes(span, attributes, GEN_AI_GENERATE_CONTENT, 'generate_content', MODEL);
  expectResponseAttributes(attributes);
  expect(attributes[SEARCH_GEN_AI__TOOL__DEFINITIONS]).toContain('get_weather');
  expect(attributes[SEARCH_GEN_AI__INPUT__MESSAGES]).toContain('weather in Paris');
  // The prompt does not name the tool, so it can only be in the output as the call the model made.
  expect(attributes[SEARCH_GEN_AI__OUTPUT__MESSAGES]).toContain('get_weather');

  await expectOnlySpanUnderRequestSpan(traceId, GEN_AI_GENERATE_CONTENT, span);
});

test('Sends embedContent to Sentry as a gen_ai.embeddings span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/embeddings');

  const { span, attributes } = await waitForSpan(traceId, GEN_AI_EMBEDDINGS);

  expectModelCallAttributes(span, attributes, GEN_AI_EMBEDDINGS, 'embeddings', EMBEDDINGS_MODEL);
  expect(attributes[SEARCH_GEN_AI__EMBEDDINGS__INPUT]).toContain('capital of France');

  await expectOnlySpanUnderRequestSpan(traceId, GEN_AI_EMBEDDINGS, span);
});
