import { describe, expect, it } from 'vitest';
import { messagesFromParams, shouldInstrument } from '../../../src/tracing/anthropic-ai/utils';

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
});
