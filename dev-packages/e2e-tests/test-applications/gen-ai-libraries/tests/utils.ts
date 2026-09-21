import { expect } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp } from '@sentry-internal/test-utils';

/** Mirrors `src/libraries.ts`, and records how strictly each library's spans can be asserted. */
export interface LibraryUnderTest {
  id: string;
  /** The op of the model-call span: `gen_ai.chat` for the direct SDKs, `gen_ai.generate_content` for
   * the Vercel AI SDK. */
  op: string;
  /** `gen_ai.provider.name` for the direct-SDK libraries; unset for the Vercel AI SDK, whose provider
   * name comes from the model id and is not asserted. */
  provider?: string;
  /** `sentry.origin` for the direct-SDK libraries; unset for the Vercel AI SDK. */
  origin?: string;
}

export const LIBRARIES: LibraryUnderTest[] = [
  { id: 'openai', op: 'gen_ai.chat', provider: 'openai', origin: 'auto.ai.openai' },
  { id: 'together', op: 'gen_ai.chat', provider: 'together_ai', origin: 'auto.ai.together_ai' },
  { id: 'mistral', op: 'gen_ai.chat', provider: 'mistralai', origin: 'auto.ai.mistralai' },
  { id: 'anthropic', op: 'gen_ai.chat', provider: 'anthropic', origin: 'auto.ai.anthropic' },
  { id: 'vercel-ai', op: 'gen_ai.generate_content' },
];

export const attr = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

/**
 * The model-call span for a library. The four direct SDKs all report `gen_ai.chat`, so the provider
 * name is what tells them apart — without it, a leftover span from another library's request could be
 * mistaken for this one's.
 */
export const isModelCallSpan = (span: SerializedStreamedSpan, library: LibraryUnderTest): boolean =>
  getSpanOp(span) === library.op && (!library.provider || attr(span, 'gen_ai.provider.name') === library.provider);

/** A span that recorded the model returning tool calls on a chat-completions request (direct SDKs). */
export const hasRecordedToolCalls = (span: SerializedStreamedSpan): boolean =>
  typeof attr(span, 'gen_ai.response.tool_calls') === 'string';

/** The dedicated tool-execution span the Vercel AI SDK emits. */
export const isExecuteToolSpan = (span: SerializedStreamedSpan): boolean => getSpanOp(span) === 'gen_ai.execute_tool';

/** Whether a trace shows any evidence of a tool call, used to tell a chat request from a tools one. */
export const traceHasToolEvidence = (spansOfTrace: SerializedStreamedSpan[]): boolean =>
  spansOfTrace.some(span => hasRecordedToolCalls(span) || isExecuteToolSpan(span));

/** A readable span tree, used as a failure message so a broken assertion is diagnosable. */
export function describeTree(spans: SerializedStreamedSpan[]): string {
  return spans
    .map(span => `${span.name} [${getSpanOp(span) ?? '-'}] id=${span.span_id} parent=${span.parent_span_id ?? '-'}`)
    .join('\n');
}

/**
 * The attributes every successful gen_ai model-call span carries, whatever the model happens to
 * answer. Model-dependent values (token counts, response text) are checked for shape, not content.
 */
export function expectCommonChatAttributes(span: SerializedStreamedSpan, library: LibraryUnderTest): void {
  const operationName = library.op.replace('gen_ai.', '');

  expect(getSpanOp(span), describeTree([span])).toBe(library.op);
  expect(attr(span, 'gen_ai.operation.name')).toBe(operationName);
  expect(span.status).toBe('ok');

  expect(typeof attr(span, 'gen_ai.provider.name')).toBe('string');
  expect(typeof attr(span, 'gen_ai.request.model')).toBe('string');
  expect(typeof attr(span, 'gen_ai.response.model')).toBe('string');
  expect(attr(span, 'gen_ai.usage.input_tokens')).toBeGreaterThan(0);
  expect(attr(span, 'gen_ai.usage.output_tokens')).toBeGreaterThan(0);
  expect(attr(span, 'gen_ai.usage.total_tokens')).toBeGreaterThan(0);

  // The direct-SDK libraries carry a stable provider name and origin; the Vercel AI SDK does not.
  if (library.provider) {
    expect(attr(span, 'gen_ai.provider.name')).toBe(library.provider);
    expect(span.name).toBe(`${operationName} ${attr(span, 'gen_ai.request.model')}`);
  }
  if (library.origin) {
    expect(attr(span, 'sentry.origin')).toBe(library.origin);
  }
}
