import { expect, test } from '@playwright/test';
import {
  GEN_AI_PROVIDER_NAME,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans } from '@sentry-internal/test-utils';
import { APP } from './constants';
import type { LibraryUnderTest } from './utils';
import { attr, describeTree, expectCommonChatAttributes, isModelCallSpan, LIBRARIES } from './utils';

// Streaming is where OpenRouter's real wire format can diverge from the mocked responses in
// node-integration-tests, so it is only covered here.

const OPENAI = LIBRARIES.find(library => library.id === 'openai')!;
const ANTHROPIC = LIBRARIES.find(library => library.id === 'anthropic')!;

const isStreamedModelCallSpan = (span: SerializedStreamedSpan, library: LibraryUnderTest): boolean =>
  isModelCallSpan(span, library) && attr(span, GEN_AI_RESPONSE_STREAMING) === true;

async function requestChatStream(
  baseURL: string | undefined,
  library: LibraryUnderTest,
): Promise<SerializedStreamedSpan> {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
    spansOfTrace.some(span => isStreamedModelCallSpan(span, library)),
  );

  const response = await fetch(`${baseURL}/${library.id}/chat-stream`);
  expect(response.status, await response.text()).toBe(200);

  const spans = await spansPromise;
  const modelSpan = spans.find(span => isStreamedModelCallSpan(span, library));
  expect(modelSpan, `expected a streamed ${library.op} span in:\n${describeTree(spans)}`).toBeDefined();
  return modelSpan!;
}

test('openai: a streamed chat completion records its token usage', async ({ baseURL }) => {
  const span = await requestChatStream(baseURL, OPENAI);

  // The usage only arrives in the final chunk, which the streaming instrumentation has to pick up.
  expectCommonChatAttributes(span, OPENAI);
  expect(attr(span, GEN_AI_RESPONSE_FINISH_REASONS)).toContain('stop');
});

test('anthropic: a streamed message records its output usage', async ({ baseURL }) => {
  const span = await requestChatStream(baseURL, ANTHROPIC);

  // Not `expectCommonChatAttributes`: the instrumentation takes the input usage from `message_start`,
  // where OpenRouter reports 0, and ignores the real count in `message_delta`.
  expect(span.status).toBe('ok');
  expect(attr(span, GEN_AI_USAGE_OUTPUT_TOKENS)).toBeGreaterThan(0);
  expect(attr(span, GEN_AI_RESPONSE_FINISH_REASONS)).toContain('end_turn');
  expect(attr(span, GEN_AI_PROVIDER_NAME)).toBe(ANTHROPIC.provider);
  expect(attr(span, SENTRY_ORIGIN)).toBe(ANTHROPIC.origin);
});
