import { describe, expect, it } from 'vitest';
import type { ContentListUnion } from '../../../src/tracing/google-genai/utils';
import { contentUnionToMessages, isStreamingMethod, shouldInstrument } from '../../../src/tracing/google-genai/utils';

describe('isStreamingMethod', () => {
  it('detects streaming methods', () => {
    expect(isStreamingMethod('messageStreamBlah')).toBe(true);
    expect(isStreamingMethod('blahblahblah generateContentStream')).toBe(true);
    expect(isStreamingMethod('blahblahblah sendMessageStream')).toBe(true);
    expect(isStreamingMethod('blahblahblah generateContentStream')).toBe(true);
    expect(isStreamingMethod('blahblahblah sendMessageStream')).toBe(true);
    expect(isStreamingMethod('blahblahblah generateContent')).toBe(false);
    expect(isStreamingMethod('blahblahblah sendMessage')).toBe(false);
  });
});

describe('shouldInstrument', () => {
  it('detects which methods to instrument', () => {
    expect(shouldInstrument('models.generateContent')).toBe(true);
    expect(shouldInstrument('some.path.to.sendMessage')).toBe(true);
    expect(shouldInstrument('unknown')).toBe(false);
  });
});

describe('convert google-genai messages to consistent message', () => {
  it('converts strings to messages', () => {
    expect(contentUnionToMessages('hello', 'system')).toStrictEqual([{ role: 'system', content: 'hello' }]);
    expect(contentUnionToMessages('hello')).toStrictEqual([{ role: 'user', content: 'hello' }]);
  });

  it('converts arrays of strings to messages', () => {
    expect(contentUnionToMessages(['hello', 'goodbye'], 'system')).toStrictEqual([
      { role: 'system', content: 'hello' },
      { role: 'system', content: 'goodbye' },
    ]);
    expect(contentUnionToMessages(['hello', 'goodbye'])).toStrictEqual([
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'goodbye' },
    ]);
  });

  it('converts PartUnion to messages', () => {
    expect(contentUnionToMessages(['hello', { parts: ['i am here', { text: 'goodbye' }] }], 'system')).toStrictEqual([
      { role: 'system', content: 'hello' },
      { role: 'system', parts: ['i am here', { text: 'goodbye' }] },
    ]);

    expect(contentUnionToMessages(['hello', { parts: ['i am here', { text: 'goodbye' }] }])).toStrictEqual([
      { role: 'user', content: 'hello' },
      { role: 'user', parts: ['i am here', { text: 'goodbye' }] },
    ]);
  });

  it('converts ContentUnion to messages', () => {
    expect(
      contentUnionToMessages(
        {
          parts: ['hello', 'goodbye'],
          role: 'agent',
        },
        'user',
      ),
    ).toStrictEqual([{ parts: ['hello', 'goodbye'], role: 'agent' }]);
  });

  it('handles unexpected formats safely', () => {
    expect(
      contentUnionToMessages(
        [
          {
            parts: ['hello', 'goodbye'],
            role: 'agent',
          },
          null,
          21345,
          { data: 'this is content' },
        ] as unknown as ContentListUnion,
        'user',
      ),
    ).toStrictEqual([
      { parts: ['hello', 'goodbye'], role: 'agent' },
      { role: 'user', content: { data: 'this is content' } },
    ]);
  });
});
