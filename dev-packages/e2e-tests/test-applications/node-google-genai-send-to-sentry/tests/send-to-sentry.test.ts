import { expect, test } from '@playwright/test';
import type { TraceItem } from './utils/sentry-api';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findSpanInTrace,
  flattenTrace,
} from './utils/sentry-api';

// Mirrors src/app.ts.
const MODEL = 'google/gemini-2.5-flash-lite';
const EMBEDDING_MODEL = 'google/gemini-embedding-001';

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

/** Whether the model-call span sits somewhere below the request span (`http.server`) of the trace. */
async function isModelSpanUnderRequestSpan(traceId: string, modelSpanId: string): Promise<boolean> {
  const requestSpan = flattenTrace(await fetchTrace(traceId)).find(item => item.op === 'http.server');
  return flattenTrace(requestSpan?.children ?? []).some(item => item.event_id === modelSpanId);
}

/**
 * The attributes every successful model-call span carries once Sentry has stored it, whatever the
 * model answers. Note the names are the stored ones: `origin` and `span.status` rather than the
 * `sentry.*` attributes the SDK sends.
 */
function expectModelCallAttributes(span: TraceItem, attributes: Attributes, operation: string, model: string): void {
  expect(span.description).toBe(`${operation} ${model}`);
  expect(attributes).toMatchObject({
    'span.op': `gen_ai.${operation}`,
    'span.status': 'ok',
    origin: 'auto.ai.google_genai',
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': 'google_genai',
    'gen_ai.request.model': model,
  });
}

/** Token usage and the model version, which every content-producing call reports. */
function expectUsage(attributes: Attributes): void {
  expect(typeof attributes['gen_ai.response.model']).toBe('string');
  expect(attributes['gen_ai.usage.input_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.usage.output_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.usage.total_tokens']).toBeGreaterThan(0);
}

/** The prompt and the answer, which the SDK records by default and which have to survive the trip. */
function expectRecordedConversation(attributes: Attributes): void {
  expect(attributes['gen_ai.system_instructions']).toContain('automated test');
  expect(attributes['gen_ai.input.messages']).toContain('capital of France');
  expect(typeof attributes['gen_ai.output.messages']).toBe('string');
  expect(attributes['gen_ai.request.temperature']).toBe(0);
}

test('Sends generateContent to Sentry as a gen_ai.generate_content span under the request span', async ({
  baseURL,
}) => {
  const traceId = await requestTrace(baseURL, '/generate');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.generate_content');

  expectModelCallAttributes(span, attributes, 'generate_content', MODEL);
  expectUsage(attributes);
  expect(attributes['gen_ai.response.streaming']).toBeUndefined();
  expectRecordedConversation(attributes);

  // The request span is the segment; it ends last, so it can land after its children.
  await expect.poll(() => isModelSpanUnderRequestSpan(traceId, span.event_id!), EVENT_POLLING_OPTIONS).toBe(true);
});

test('Sends generateContentStream to Sentry with its token usage', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/generate-stream');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.generate_content');

  expectModelCallAttributes(span, attributes, 'generate_content', MODEL);
  expectUsage(attributes);
  expect(attributes['gen_ai.response.streaming']).toBe(true);
  expectRecordedConversation(attributes);
});

test('Sends a chat message to Sentry as a gen_ai.chat span with the config given to chats.create()', async ({
  baseURL,
}) => {
  const traceId = await requestTrace(baseURL, '/chat');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expectModelCallAttributes(span, attributes, 'chat', MODEL);
  expectUsage(attributes);
  expectRecordedConversation(attributes);
});

test('Sends a generateContent call that returned a function call to Sentry', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/tools');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.generate_content');

  expectModelCallAttributes(span, attributes, 'generate_content', MODEL);
  expectUsage(attributes);
  expect(attributes['gen_ai.tool.definitions']).toContain('get_weather');
  expect(attributes['gen_ai.input.messages']).toContain('weather in Paris');
});

test('Sends embedContent to Sentry as a gen_ai.embeddings span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/embeddings');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.embeddings');

  expectModelCallAttributes(span, attributes, 'embeddings', EMBEDDING_MODEL);
  expect(attributes['gen_ai.embeddings.input']).toContain('capital of France');
});
