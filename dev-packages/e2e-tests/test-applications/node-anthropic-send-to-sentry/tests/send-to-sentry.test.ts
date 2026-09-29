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
const MODEL = 'openai/gpt-4o-mini';

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
 * model answers. Model-dependent values (token counts, response id and model) are checked for shape,
 * not content. Note the names are the stored ones: `origin` and `span.status` rather than the
 * `sentry.*` attributes the SDK sends.
 */
function expectModelCallAttributes(span: TraceItem, attributes: Attributes): void {
  expect(span.description).toBe(`chat ${MODEL}`);
  expect(attributes).toMatchObject({
    'span.op': 'gen_ai.chat',
    'span.status': 'ok',
    origin: 'auto.ai.anthropic',
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': 'anthropic',
    'gen_ai.request.model': MODEL,
  });
  expect(typeof attributes['gen_ai.response.id']).toBe('string');
  expect(typeof attributes['gen_ai.response.model']).toBe('string');
  expect(attributes['gen_ai.usage.output_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.usage.total_tokens']).toBeGreaterThan(0);
}

/** The prompt and the answer, which the SDK records by default and which have to survive the trip. */
function expectRecordedConversation(attributes: Attributes): void {
  // The answer is sent as `gen_ai.response.text` and stored as `gen_ai.output.messages`.
  expect(attributes['gen_ai.system_instructions']).toContain('automated test');
  expect(attributes['gen_ai.input.messages']).toContain('capital of France');
  expect(typeof attributes['gen_ai.output.messages']).toBe('string');
}

/** `gen_ai.response.finish_reasons` is a JSON array, only recorded for streamed calls. */
function finishReasons(attributes: Attributes): string[] {
  return JSON.parse(attributes['gen_ai.response.finish_reasons'] as string);
}

test('Sends a message to Sentry as a gen_ai.chat span under the request span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/chat');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expectModelCallAttributes(span, attributes);
  expect(attributes['gen_ai.usage.input_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.request.temperature']).toBe(0);
  expect(attributes['gen_ai.response.streaming']).toBeUndefined();
  expectRecordedConversation(attributes);

  // The request span is the segment; it ends last, so it can land after its children.
  await expect.poll(() => isModelSpanUnderRequestSpan(traceId, span.event_id!), EVENT_POLLING_OPTIONS).toBe(true);
});

test('Sends a streamed message to Sentry with its token usage', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/chat-stream');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expectModelCallAttributes(span, attributes);
  expect(attributes['gen_ai.response.streaming']).toBe(true);
  expect(finishReasons(attributes)).toContain('end_turn');
  expectRecordedConversation(attributes);
  // The input usage is not asserted: the instrumentation takes it from `message_start`, where
  // OpenRouter reports 0, and ignores the real count OpenRouter (and the Anthropic API) put in
  // `message_delta`. Output usage comes from `message_delta` and is covered by the shared checks.
});

test('Sends a message made with the stream helper to Sentry', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/stream-helper');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  // `messages.stream()` is instrumented on its own channel and calls `create` underneath, which must
  // not produce a second span.
  expect(flattenTrace(await fetchTrace(traceId)).filter(item => item.op === 'gen_ai.chat')).toHaveLength(1);
  expectModelCallAttributes(span, attributes);
  expect(attributes['gen_ai.response.streaming']).toBe(true);
  expect(finishReasons(attributes)).toContain('end_turn');
  expectRecordedConversation(attributes);
});

test('Sends a message that returned a tool use to Sentry', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/tools');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expectModelCallAttributes(span, attributes);
  expect(attributes['gen_ai.usage.input_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.tool.definitions']).toContain('get_weather');
  expect(attributes['gen_ai.input.messages']).toContain('weather in Paris');
  // The SDK also sends the returned tool use as `gen_ai.response.tool_calls`, but that attribute is
  // not stored under that name, and stop reasons are only recorded for streamed calls.
});
