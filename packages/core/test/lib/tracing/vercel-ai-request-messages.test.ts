import { describe, expect, it } from 'vitest';
import { getJsonString, getTruncatedJsonString } from '../../../src/tracing/ai/utils';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { requestMessagesFromPrompt } from '../../../src/tracing/vercel-ai/utils';
import { AI_PROMPT_MESSAGES_ATTRIBUTE } from '../../../src/tracing/vercel-ai/vercel-ai-attributes';
import type { Span, SpanAttributes } from '../../../src/types/span';

/**
 * Minimal span that records the attributes set on it, so we can assert on the
 * exact serialized value `requestMessagesFromPrompt` writes back.
 */
function createRecordingSpan(): { span: Span; recorded: Record<string, unknown> } {
  const recorded: Record<string, unknown> = {};
  const span = {
    setAttribute(key: string, value: unknown): void {
      recorded[key] = value;
    },
    setAttributes(attributes: Record<string, unknown>): void {
      Object.assign(recorded, attributes);
    },
  } as unknown as Span;
  return { span, recorded };
}

describe('requestMessagesFromPrompt (ai.prompt.messages string branch)', () => {
  it('reuses the original string verbatim when no system message and truncation is off', () => {
    const { span, recorded } = createRecordingSpan();

    // Deliberately non-canonical whitespace. Re-serializing (JSON.stringify(JSON.parse(x)))
    // would strip it, so a byte-identical result proves the original string was reused.
    const original = '[ { "role": "user",   "content": "hello world" } ]';
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: original } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes, /* enableTruncation */ false);

    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(original);
    expect(recorded[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBe(original);
    expect(recorded[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toBe(1);
    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeUndefined();
  });

  it('extracts the system message and re-serializes the remainder when truncation is off', () => {
    const { span, recorded } = createRecordingSpan();

    const original = JSON.stringify([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hello' },
    ]);
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: original } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes, false);

    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBe(JSON.stringify([{ type: 'text', content: 'be nice' }]));
    // System message removed; output is the SDK's own serialization of just the remainder.
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(getJsonString([{ role: 'user', content: 'hello' }]));
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).not.toBe(original);
    expect(recorded[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toBe(1);
  });

  it('keeps the truncation path untouched when truncation is on', () => {
    const { span, recorded } = createRecordingSpan();

    const messages = [
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ];
    const original = JSON.stringify(messages);
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: original } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes, /* enableTruncation */ true);

    // Output must equal the SDK's own truncated serialization (and therefore differ from the
    // input), proving the fast-path reuse did NOT short-circuit the truncation branch.
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(getTruncatedJsonString(messages));
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).not.toBe(original);
    // Original (pre-truncation) message count is still reported.
    expect(recorded[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toBe(2);
  });

  it('does not throw and sets no attributes for malformed JSON', () => {
    const { span, recorded } = createRecordingSpan();

    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: '{ not json' } as unknown as SpanAttributes;

    expect(() => requestMessagesFromPrompt(span, attributes, false)).not.toThrow();
    expect(Object.keys(recorded)).toHaveLength(0);
  });
});
