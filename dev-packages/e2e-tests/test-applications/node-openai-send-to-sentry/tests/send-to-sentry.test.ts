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
const CHAT_MODEL = 'openai/gpt-4o-mini';
const EMBEDDINGS_MODEL = 'openai/text-embedding-3-small';

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
function expectModelCallAttributes(attributes: Attributes, operation: 'chat' | 'embeddings', model: string): void {
  expect(attributes).toMatchObject({
    'span.op': `gen_ai.${operation}`,
    'span.status': 'ok',
    origin: 'auto.ai.openai',
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': 'openai',
    'gen_ai.request.model': model,
  });
  expect(typeof attributes['gen_ai.response.id']).toBe('string');
  expect(typeof attributes['gen_ai.response.model']).toBe('string');
  expect(attributes['gen_ai.usage.input_tokens']).toBeGreaterThan(0);
  expect(attributes['gen_ai.usage.total_tokens']).toBeGreaterThan(0);
}

/** `gen_ai.response.finish_reasons` is a JSON array; a streamed answer can repeat the reason per chunk. */
function finishReasons(attributes: Attributes): string[] {
  return JSON.parse(attributes['gen_ai.response.finish_reasons'] as string);
}

test('Sends a chat completion to Sentry as a gen_ai.chat span under the request span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/chat');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expect(span.description).toBe(`chat ${CHAT_MODEL}`);
  expectModelCallAttributes(attributes, 'chat', CHAT_MODEL);
  expect(attributes['gen_ai.usage.output_tokens']).toBeGreaterThan(0);
  expect(finishReasons(attributes)).toEqual(['stop']);
  expect(attributes['gen_ai.response.streaming']).toBeUndefined();

  // The SDK records prompts and answers by default, and they have to survive the trip to Sentry. The
  // answer is sent as `gen_ai.response.text` and stored as `gen_ai.output.messages`.
  expect(attributes['gen_ai.system_instructions']).toContain('automated test');
  expect(attributes['gen_ai.input.messages']).toContain('capital of France');
  expect(typeof attributes['gen_ai.output.messages']).toBe('string');

  // The request span is the segment; it ends last, so it can land after its children.
  await expect.poll(() => isModelSpanUnderRequestSpan(traceId, span.event_id!), EVENT_POLLING_OPTIONS).toBe(true);
});

test('Sends a streamed chat completion to Sentry with its token usage', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/chat-stream');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expect(span.description).toBe(`chat ${CHAT_MODEL}`);
  expectModelCallAttributes(attributes, 'chat', CHAT_MODEL);
  expect(attributes['gen_ai.response.streaming']).toBe(true);
  // The usage only arrives in the final chunk, which the streaming instrumentation has to pick up.
  expect(attributes['gen_ai.usage.output_tokens']).toBeGreaterThan(0);
  expect(finishReasons(attributes)).toContain('stop');
  expect(typeof attributes['gen_ai.output.messages']).toBe('string');
});

test('Sends a chat completion that returned a tool call to Sentry', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/tools');

  const { attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expectModelCallAttributes(attributes, 'chat', CHAT_MODEL);
  expect(finishReasons(attributes)).toEqual(['tool_calls']);
  expect(attributes['gen_ai.tool.definitions']).toContain('get_weather');
  // The SDK also sends the returned call as `gen_ai.response.tool_calls`, but that attribute is not
  // stored as such, so the finish reason is what proves the tool call made it.
});

test('Sends a Responses API call to Sentry as a gen_ai.chat span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/responses');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.chat');

  expect(span.description).toBe(`chat ${CHAT_MODEL}`);
  expectModelCallAttributes(attributes, 'chat', CHAT_MODEL);
  expect(attributes['gen_ai.usage.output_tokens']).toBeGreaterThan(0);
  expect(finishReasons(attributes)).toEqual(['completed']);
  expect(attributes['gen_ai.input.messages']).toContain('capital of France');
  expect(typeof attributes['gen_ai.output.messages']).toBe('string');
});

test('Sends an embeddings call to Sentry as a gen_ai.embeddings span', async ({ baseURL }) => {
  const traceId = await requestTrace(baseURL, '/embeddings');

  const { span, attributes } = await waitForSpan(traceId, 'gen_ai.embeddings');

  expect(span.description).toBe(`embeddings ${EMBEDDINGS_MODEL}`);
  expectModelCallAttributes(attributes, 'embeddings', EMBEDDINGS_MODEL);
  expect(attributes['gen_ai.embeddings.input']).toContain('Paris');
});
