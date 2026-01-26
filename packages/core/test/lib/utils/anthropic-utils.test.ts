import { describe, expect, it } from 'vitest';
import { messagesFromParams, setMessagesAttribute, shouldInstrument } from '../../../src/tracing/anthropic-ai/utils';
import type { Span } from '../../../src/types-hoist/span';

describe('anthropic-ai-utils', () => {
  describe('shouldInstrument', () => {
    it('should instrument known methods', () => {
      expect(shouldInstrument('models.get')).toBe(true);
    });

    it('should not instrument unknown methods', () => {
      expect(shouldInstrument('models.unknown.thing')).toBe(false);
    });
  });

  describe('messagesFromParams', () => {
    it('includes system message in messages list', () => {
      expect(
        messagesFromParams({
          messages: [{ role: 'user', content: 'hello' }],
          system: 'You are a friendly robot awaiting a greeting.',
        }),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot awaiting a greeting.' },
        { role: 'user', content: 'hello' },
      ]);
    });

    it('looks to params.input ahead of params.messages', () => {
      expect(
        messagesFromParams({
          input: [{ role: 'user', content: 'input' }],
          messages: [{ role: 'user', content: 'hello' }],
          system: 'You are a friendly robot awaiting a greeting.',
        }),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot awaiting a greeting.' },
        { role: 'user', content: 'input' },
      ]);
    });

    it('includes system message along with non-array messages', () => {
      expect(
        messagesFromParams({
          messages: { role: 'user', content: 'hello' },
          system: 'You are a friendly robot awaiting a greeting.',
        }),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot awaiting a greeting.' },
        { role: 'user', content: 'hello' },
      ]);
    });

    it('includes system message if no other messages', () => {
      expect(
        messagesFromParams({
          system: 'You are a friendly robot awaiting a greeting.',
        }),
      ).toStrictEqual([{ role: 'system', content: 'You are a friendly robot awaiting a greeting.' }]);
    });

    it('returns messages if no system message', () => {
      expect(
        messagesFromParams({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      ).toStrictEqual([{ role: 'user', content: 'hello' }]);
    });
  });

  describe('setMessagesAtribute', () => {
    const mock = {
      attributes: {} as Record<string, any>,
      setAttributes(kv: Record<string, any>) {
        for (const [key, val] of Object.entries(kv)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          if (val === undefined) delete this.attributes[key];
          else this.attributes[key] = val;
        }
      },
    };
    const span = mock as unknown as Span;

    it('sets length along with truncated value', () => {
      const content = 'A'.repeat(200_000);
      setMessagesAttribute(span, [{ role: 'user', content }]);
      const result = [{ role: 'user', content: 'A'.repeat(19972) }];
      expect(mock.attributes).toStrictEqual({
        'sentry.sdk_meta.gen_ai.input.messages.original_length': 1,
        'gen_ai.input.messages': JSON.stringify(result),
      });
    });

    it('sets length to 1 for non-array input', () => {
      setMessagesAttribute(span, { content: 'hello, world' });
      expect(mock.attributes).toStrictEqual({
        'sentry.sdk_meta.gen_ai.input.messages.original_length': 1,
        'gen_ai.input.messages': '{"content":"hello, world"}',
      });
    });

    it('ignores empty array', () => {
      setMessagesAttribute(span, []);
      expect(mock.attributes).toStrictEqual({
        'sentry.sdk_meta.gen_ai.input.messages.original_length': 1,
        'gen_ai.input.messages': '{"content":"hello, world"}',
      });
    });
  });
});
