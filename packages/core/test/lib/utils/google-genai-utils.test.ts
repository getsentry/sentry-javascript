import { describe, expect, it } from 'vitest';
import type { ContentListUnion } from '../../../src/tracing/google-genai/utils';
import { contentUnionToMessages } from '../../../src/tracing/google-genai/utils';

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
