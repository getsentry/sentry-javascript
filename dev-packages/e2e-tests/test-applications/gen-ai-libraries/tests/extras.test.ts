import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { attr, describeTree, expectCommonChatAttributes, LIBRARIES } from './utils';

const OPENAI = LIBRARIES.find(library => library.id === 'openai')!;
const ANTHROPIC = LIBRARIES.find(library => library.id === 'anthropic')!;

/**
 * Calls `/:lib/:extra` and returns its trace once the request span (the segment) has arrived. The
 * segment ends last, so every model-call span of the request is in by then.
 */
async function requestExtra(baseURL: string | undefined, path: string): Promise<SerializedStreamedSpan[]> {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => spansOfTrace.some(span => span.name === path) && spansOfTrace.some(span => span.is_segment),
  );

  const response = await fetch(`${baseURL}/${path}`);
  expect(response.status, await response.text()).toBe(200);

  return spansPromise;
}

/** The only span of the trace with `op`; finding exactly one also catches a call instrumented twice. */
function onlySpanWithOp(spans: SerializedStreamedSpan[], op: string): SerializedStreamedSpan {
  const matching = spans.filter(span => getSpanOp(span) === op);
  expect(matching, `expected exactly one ${op} span in:\n${describeTree(spans)}`).toHaveLength(1);
  return matching[0]!;
}

/** `gen_ai.response.finish_reasons` is a JSON array; a streamed answer can repeat the reason per chunk. */
function finishReasons(span: SerializedStreamedSpan): string[] {
  const raw = attr(span, 'gen_ai.response.finish_reasons');
  expect(typeof raw, 'gen_ai.response.finish_reasons').toBe('string');
  return JSON.parse(raw as string);
}

test('openai: a streamed chat completion records its token usage', async ({ baseURL }) => {
  const spans = await requestExtra(baseURL, 'openai/chat-stream');
  const span = onlySpanWithOp(spans, 'gen_ai.chat');

  // The usage only arrives in the final chunk, which the streaming instrumentation has to pick up.
  expectCommonChatAttributes(span, OPENAI);
  expect(attr(span, 'gen_ai.response.streaming')).toBe(true);
  expect(finishReasons(span)).toContain('stop');
});

test('openai: a Responses API call emits a gen_ai.chat span', async ({ baseURL }) => {
  const spans = await requestExtra(baseURL, 'openai/responses');
  const span = onlySpanWithOp(spans, 'gen_ai.chat');

  expectCommonChatAttributes(span, OPENAI);
  expect(finishReasons(span)).toEqual(['completed']);
  expect(attr(span, 'gen_ai.input.messages')).toContain('capital of France');
});

test('openai: an embeddings call emits a gen_ai.embeddings span', async ({ baseURL }) => {
  const spans = await requestExtra(baseURL, 'openai/embeddings');
  const span = onlySpanWithOp(spans, 'gen_ai.embeddings');

  expect(span.name).toBe('embeddings openai/text-embedding-3-small');
  expect(span.status).toBe('ok');
  expect(attr(span, 'sentry.origin')).toBe('auto.ai.openai');
  expect(attr(span, 'gen_ai.operation.name')).toBe('embeddings');
  expect(attr(span, 'gen_ai.provider.name')).toBe('openai');
  expect(attr(span, 'gen_ai.embeddings.input')).toContain('Paris');
  expect(attr(span, 'gen_ai.usage.input_tokens')).toBeGreaterThan(0);
});

test('anthropic: a streamed message records its output usage', async ({ baseURL }) => {
  const spans = await requestExtra(baseURL, 'anthropic/chat-stream');
  const span = onlySpanWithOp(spans, 'gen_ai.chat');

  expect(attr(span, 'gen_ai.response.streaming')).toBe(true);
  expect(finishReasons(span)).toContain('end_turn');
  expect(attr(span, 'gen_ai.usage.output_tokens')).toBeGreaterThan(0);
  // The input usage is not asserted: the instrumentation takes it from `message_start`, where
  // OpenRouter reports 0, and ignores the real count OpenRouter (and the Anthropic API) put in
  // `message_delta`.
  expect(attr(span, 'gen_ai.provider.name')).toBe(ANTHROPIC.provider);
  expect(attr(span, 'sentry.origin')).toBe(ANTHROPIC.origin);
});

test('anthropic: the stream helper emits a single gen_ai.chat span', async ({ baseURL }) => {
  const spans = await requestExtra(baseURL, 'anthropic/stream-helper');
  // `messages.stream()` calls `create` underneath, which must not produce a second span.
  const span = onlySpanWithOp(spans, 'gen_ai.chat');

  expect(attr(span, 'gen_ai.response.streaming')).toBe(true);
  expect(finishReasons(span)).toContain('end_turn');
  expect(attr(span, 'gen_ai.usage.output_tokens')).toBeGreaterThan(0);
  expect(attr(span, 'gen_ai.provider.name')).toBe(ANTHROPIC.provider);
  expect(attr(span, 'sentry.origin')).toBe(ANTHROPIC.origin);
});
