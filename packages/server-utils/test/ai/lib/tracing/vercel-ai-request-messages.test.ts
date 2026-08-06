import { describe, expect, it } from 'vitest';
import { stringify } from '@sentry/core';
import { GEN_AI_INPUT_MESSAGES, GEN_AI_SYSTEM_INSTRUCTIONS } from '@sentry/conventions/attributes';
import { requestMessagesFromPrompt } from '../../../../src/ai/vercel-ai/utils';
import { AI_PROMPT_MESSAGES_ATTRIBUTE } from '../../../../src/ai/vercel-ai/vercel-ai-attributes';
import type { Span, SpanAttributes } from '@sentry/core';

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
  it('serializes all messages when there is no system message', () => {
    const { span, recorded } = createRecordingSpan();

    const messages = [{ role: 'user', content: 'hello world' }];
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: JSON.stringify(messages) } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes);

    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(stringify(messages));
    expect(recorded[GEN_AI_INPUT_MESSAGES]).toBe(stringify(messages));
    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
  });

  it('extracts the system message and serializes the remainder', () => {
    const { span, recorded } = createRecordingSpan();

    const original = JSON.stringify([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hello' },
    ]);
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: original } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes);

    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe(JSON.stringify([{ type: 'text', content: 'be nice' }]));
    // System message removed; output is just the remainder.
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(stringify([{ role: 'user', content: 'hello' }]));
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).not.toBe(original);
  });

  it('does not throw and sets no attributes for malformed JSON', () => {
    const { span, recorded } = createRecordingSpan();

    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: '{ not json' } as unknown as SpanAttributes;

    expect(() => requestMessagesFromPrompt(span, attributes)).not.toThrow();
    expect(Object.keys(recorded)).toHaveLength(0);
  });
});
