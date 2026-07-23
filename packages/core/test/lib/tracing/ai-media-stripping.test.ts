import { describe, expect, it } from 'vitest';
import { stripInlineMediaFromMessages } from '../../../src/tracing/ai/mediaStripping';
import { getGenAiMessagesJsonString } from '../../../src/tracing/ai/utils';

describe('media stripping utilities', () => {
  describe('stripInlineMediaFromMessages', () => {
    it('leaves empty/non-array/small messages alone', () => {
      expect(stripInlineMediaFromMessages([])).toStrictEqual([]);
      expect(stripInlineMediaFromMessages([{ text: 'hello' }])).toStrictEqual([{ text: 'hello' }]);
    });

    it('strips inline media from messages, keeping all messages', () => {
      const b64 = Buffer.from('lots of data\n').toString('base64');
      const removed = '[Blob substitute]';
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
      const result = stripInlineMediaFromMessages(messages);

      // original messages objects must not be mutated
      expect(JSON.stringify(messages, null, 2)).toBe(messagesJson);
      // all messages are kept, with inline media stripped
      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: removed,
              },
            },
          ],
        },
        {
          role: 'user',
          content: {
            image_url: removed,
          },
        },
        {
          role: 'agent',
          type: 'image',
          content: {
            b64_json: removed,
          },
        },
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

    it('strips OpenAI vision format with nested image_url object', () => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hnoEIwDiqkL4KAQBf9AoL/k2KLAAAAABJRU5ErkJggg==';
      const removed = '[Blob substitute]';

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${b64}`,
              },
            },
          ],
        },
      ];

      const messagesJson = JSON.stringify(messages, null, 2);
      const result = stripInlineMediaFromMessages(messages);

      // original messages must not be mutated
      expect(JSON.stringify(messages, null, 2)).toBe(messagesJson);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: removed,
              },
            },
          ],
        },
      ]);

      // Validate no raw base64 leaks
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/[A-Za-z0-9+/]{100,}={0,2}/);
      expect(serialized).toContain('[Blob substitute]');
    });

    it('does not redact image_url with regular URL (non-data: scheme)', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: 'https://example.com/image.png',
              },
            },
          ],
        },
      ];

      const result = stripInlineMediaFromMessages(messages);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: 'https://example.com/image.png',
              },
            },
          ],
        },
      ]);
    });

    it('strips multiple image parts in a single message', () => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hnoEIwDiqkL4KAQBf9AoL/k2KLAAAAABJRU5ErkJggg==';
      const removed = '[Blob substitute]';

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${b64}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${b64}` },
            },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/safe.png' },
            },
          ],
        },
      ];

      const result = stripInlineMediaFromMessages(messages);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images' },
            {
              type: 'image_url',
              image_url: { url: removed },
            },
            {
              type: 'image_url',
              image_url: { url: removed },
            },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/safe.png' },
            },
          ],
        },
      ]);
    });

    it('strips input_audio data from messages', () => {
      const b64Audio = Buffer.from('fake audio data for testing').toString('base64');
      const removed = '[Blob substitute]';

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What does this audio say?' },
            {
              type: 'input_audio',
              input_audio: {
                data: b64Audio,
                format: 'wav',
              },
            },
          ],
        },
      ];

      const messagesJson = JSON.stringify(messages, null, 2);
      const result = stripInlineMediaFromMessages(messages);

      expect(JSON.stringify(messages, null, 2)).toBe(messagesJson);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What does this audio say?' },
            {
              type: 'input_audio',
              input_audio: {
                data: removed,
                format: 'wav',
              },
            },
          ],
        },
      ]);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(b64Audio);
      expect(serialized).toContain(removed);
    });

    it('strips file_data from file content parts', () => {
      const b64File = Buffer.from('fake file content for testing').toString('base64');
      const removed = '[Blob substitute]';

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document' },
            {
              type: 'file',
              file: {
                file_data: b64File,
                filename: 'document.pdf',
              },
            },
          ],
        },
      ];

      const messagesJson = JSON.stringify(messages, null, 2);
      const result = stripInlineMediaFromMessages(messages);

      expect(JSON.stringify(messages, null, 2)).toBe(messagesJson);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document' },
            {
              type: 'file',
              file: {
                file_data: removed,
                filename: 'document.pdf',
              },
            },
          ],
        },
      ]);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(b64File);
      expect(serialized).toContain(removed);
    });

    it('does not redact file parts that only have file_id (no inline data)', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document' },
            {
              type: 'file',
              file: {
                file_id: 'file-abc123',
                filename: 'document.pdf',
              },
            },
          ],
        },
      ];

      const result = stripInlineMediaFromMessages(messages);

      expect(result).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document' },
            {
              type: 'file',
              file: {
                file_id: 'file-abc123',
                filename: 'document.pdf',
              },
            },
          ],
        },
      ]);
    });
  });

  describe('getGenAiMessagesJsonString', () => {
    it('returns a fallback instead of throwing on circular references', () => {
      const circular: Record<string, unknown> = { role: 'user', content: 'hi' };
      circular.self = circular;

      expect(getGenAiMessagesJsonString(circular)).toBe('[unserializable]');
      expect(getGenAiMessagesJsonString([circular])).toBe('[unserializable]');
    });

    it('returns strings as-is and serializes objects', () => {
      expect(getGenAiMessagesJsonString('hello')).toBe('hello');
      expect(getGenAiMessagesJsonString({ a: 1 })).toBe('{"a":1}');
    });

    it('strips inline media from message arrays while keeping all messages', () => {
      const b64 = Buffer.from('lots of data\n').toString('base64');
      const messages = [
        { role: 'user', content: 'first message' },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }],
        },
      ];

      const result = getGenAiMessagesJsonString(messages);

      expect(result).toBe(
        JSON.stringify([
          { role: 'user', content: 'first message' },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: '[Blob substitute]' } }] },
        ]),
      );
      expect(result).not.toContain(b64);
    });
  });
});
