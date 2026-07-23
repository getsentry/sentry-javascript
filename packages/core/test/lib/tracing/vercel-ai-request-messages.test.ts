import { describe, expect, it } from 'vitest';
import { getGenAiMessagesJsonString } from '../../../src/tracing/ai/utils';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
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
  it('serializes all messages when there is no system message', () => {
    const { span, recorded } = createRecordingSpan();

    const messages = [{ role: 'user', content: 'hello world' }];
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: JSON.stringify(messages) } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes);

    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(getGenAiMessagesJsonString(messages));
    expect(recorded[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBe(getGenAiMessagesJsonString(messages));
    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeUndefined();
  });

  it('extracts the system message and serializes the remainder', () => {
    const { span, recorded } = createRecordingSpan();

    const original = JSON.stringify([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hello' },
    ]);
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: original } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes);

    expect(recorded[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBe(JSON.stringify([{ type: 'text', content: 'be nice' }]));
    // System message removed; output is just the remainder.
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(
      getGenAiMessagesJsonString([{ role: 'user', content: 'hello' }]),
    );
    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).not.toBe(original);
  });

  it('keeps all messages and strips inline media', () => {
    const { span, recorded } = createRecordingSpan();

    const b64 = Buffer.from('lots of data\n').toString('base64');
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }] },
    ];
    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: JSON.stringify(messages) } as unknown as SpanAttributes;

    requestMessagesFromPrompt(span, attributes);

    expect(recorded[AI_PROMPT_MESSAGES_ATTRIBUTE]).toBe(getGenAiMessagesJsonString(messages));
    expect(recorded[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toContain('first');
    expect(recorded[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toContain('[Blob substitute]');
    expect(recorded[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).not.toContain(b64);
  });

  it('does not throw and sets no attributes for malformed JSON', () => {
    const { span, recorded } = createRecordingSpan();

    const attributes = { [AI_PROMPT_MESSAGES_ATTRIBUTE]: '{ not json' } as unknown as SpanAttributes;

    expect(() => requestMessagesFromPrompt(span, attributes)).not.toThrow();
    expect(Object.keys(recorded)).toHaveLength(0);
  });
});
