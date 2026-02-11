import { describe, expect, it } from 'vitest';
import { truncateGenAiMessages, truncateGenAiStringInput } from '../../../src/tracing/ai/messageTruncation';

describe('message truncation utilities', () => {
  describe('truncateGenAiMessages', () => {
    it('leaves empty/non-array/small messages alone', () => {
      // @ts-expect-error - exercising invalid type code path
      expect(truncateGenAiMessages(null)).toBe(null);
      expect(truncateGenAiMessages([])).toStrictEqual([]);
      expect(truncateGenAiMessages([{ text: 'hello' }])).toStrictEqual([{ text: 'hello' }]);
      expect(truncateGenAiStringInput('hello')).toBe('hello');
    });

    it('strips inline media from messages', () => {
      const b64 = Buffer.from('lots of data\n').toString('base64');
      const removed = '[Filtered]';
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: b64,
              },
            },
          ],
        },
        {
          role: 'user',
          content: {
            image_url: `data:image/png;base64,${b64}`,
          },
        },
        {
          role: 'agent',
          type: 'image',
          content: {
            b64_json: b64,
          },
        },
        {
          role: 'system',
          inlineData: {
            mimeType: 'kiki/booba',
            data: 'booboobooboobooba',
          },
          content: [
            'this one has content AND parts and has inline data',
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: b64,
              },
            },
          ],
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: 'bloobloobloo',
              },
            },
            {
              image_url: `data:image/png;base64,${b64}`,
            },
            {
              type: 'image_generation',
              result: b64,
            },
            {
              uri: `data:image/png;base64,${b64}`,
              mediaType: 'image/png',
            },
            {
              type: 'blob',
              mediaType: 'image/png',
              content: b64,
            },
            {
              type: 'text',
              text: 'just some text!',
            },
            'unadorned text',
          ],
        },
      ];

      // indented json makes for better diffs in test output
      const messagesJson = JSON.stringify(messages, null, 2);
      const result = truncateGenAiMessages(messages);

      // original messages objects must not be mutated
      expect(JSON.stringify(messages, null, 2)).toBe(messagesJson);
      // only the last message should be kept (with media stripped)
      expect(result).toStrictEqual([
        {
          role: 'system',
          inlineData: {
            mimeType: 'kiki/booba',
            data: removed,
          },
          content: [
            'this one has content AND parts and has inline data',
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: removed,
              },
            },
          ],
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: removed,
              },
            },
            {
              image_url: removed,
            },
            {
              type: 'image_generation',
              result: removed,
            },
            {
              uri: removed,
              mediaType: 'image/png',
            },
            {
              type: 'blob',
              mediaType: 'image/png',
              content: removed,
            },
            {
              type: 'text',
              text: 'just some text!',
            },
            'unadorned text',
          ],
        },
      ]);
    });

    const humongous = 'this is a long string '.repeat(10_000);
    const giant = 'this is a long string '.repeat(1_000);
    const big = 'this is a long string '.repeat(100);

    it('keeps only the last message without truncation when it fits the limit', () => {
      // Multiple messages that together exceed 20KB, but last message is small
      const messages = [
        { content: `1 ${humongous}` },
        { content: `2 ${humongous}` },
        { content: `3 ${big}` }, // last message - small enough to fit
      ];

      const result = truncateGenAiMessages(messages);

      // Should only keep the last message, unchanged
      expect(result).toStrictEqual([{ content: `3 ${big}` }]);
    });

    it('keeps only the last message with truncation when it does not fit the limit', () => {
      const messages = [{ content: `1 ${humongous}` }, { content: `2 ${humongous}` }, { content: `3 ${humongous}` }];
      const result = truncateGenAiMessages(messages);
      const truncLen = 20_000 - JSON.stringify({ content: '' }).length;
      expect(result).toStrictEqual([{ content: `3 ${humongous}`.substring(0, truncLen) }]);
    });

    it('drops if last message cannot be safely truncated', () => {
      const messages = [
        { content: `1 ${humongous}` },
        { content: `2 ${humongous}` },
        { what_even_is_this: `? ${humongous}` },
      ];
      const result = truncateGenAiMessages(messages);
      expect(result).toStrictEqual([]);
    });

    it('fully drops message if content cannot be made to fit', () => {
      const messages = [{ some_other_field: humongous, content: 'hello' }];
      expect(truncateGenAiMessages(messages)).toStrictEqual([]);
    });

    it('truncates if the message content string will not fit', () => {
      const messages = [{ content: `2 ${humongous}` }];
      const result = truncateGenAiMessages(messages);
      const truncLen = 20_000 - JSON.stringify({ content: '' }).length;
      expect(result).toStrictEqual([{ content: `2 ${humongous}`.substring(0, truncLen) }]);
    });

    it('fully drops message if first part overhead does not fit', () => {
      const messages = [
        {
          parts: [{ some_other_field: humongous }],
        },
      ];
      expect(truncateGenAiMessages(messages)).toStrictEqual([]);
    });

    it('fully drops message if overhead too large', () => {
      const messages = [
        {
          some_other_field: humongous,
          parts: [],
        },
      ];
      expect(truncateGenAiMessages(messages)).toStrictEqual([]);
    });

    it('truncates if the first message part will not fit', () => {
      const messages = [
        {
          parts: [`2 ${humongous}`, { some_other_field: 'no text here' }],
        },
      ];

      const result = truncateGenAiMessages(messages);

      // interesting (unexpected?) edge case effect of this truncation.
      // subsequent messages count towards truncation overhead limit,
      // but are not included, even without their text. This is an edge
      // case that seems unlikely in normal usage.
      const truncLen =
        20_000 -
        JSON.stringify({
          parts: ['', { some_other_field: 'no text here', text: '' }],
        }).length;

      expect(result).toStrictEqual([
        {
          parts: [`2 ${humongous}`.substring(0, truncLen)],
        },
      ]);
    });

    it('truncates if the first message part will not fit, text object', () => {
      const messages = [
        {
          parts: [{ text: `2 ${humongous}` }],
        },
      ];
      const result = truncateGenAiMessages(messages);
      const truncLen =
        20_000 -
        JSON.stringify({
          parts: [{ text: '' }],
        }).length;
      expect(result).toStrictEqual([
        {
          parts: [
            {
              text: `2 ${humongous}`.substring(0, truncLen),
            },
          ],
        },
      ]);
    });

    it('drops if subsequent message part will not fit, text object', () => {
      const messages = [
        {
          parts: [
            { text: `1 ${big}` },
            { some_other_field: 'ok' },
            { text: `2 ${big}` },
            { text: `3 ${big}` },
            { text: `4 ${giant}` },
            { text: `5 ${giant}` },
            { text: `6 ${big}` },
            { text: `7 ${big}` },
            { text: `8 ${big}` },
          ],
        },
      ];
      const result = truncateGenAiMessages(messages);
      expect(result).toStrictEqual([
        {
          parts: [{ text: `1 ${big}` }, { some_other_field: 'ok' }, { text: `2 ${big}` }, { text: `3 ${big}` }],
        },
      ]);
    });
  });
});
