import { describe, expect, it } from 'vitest';
import {
  extractChatModelRequestAttributes,
  normalizeLangChainMessages,
} from '../../../src/tracing/langchain/utils';
import { GEN_AI_INPUT_MESSAGES_ATTRIBUTE } from '../../../src/tracing/ai/gen-ai-attributes';
import type { LangChainMessage } from '../../../src/tracing/langchain/types';

describe('normalizeLangChainMessages', () => {
  it('normalizes messages with _getType()', () => {
    const messages = [
      {
        _getType: () => 'human',
        content: 'Hello',
      },
      {
        _getType: () => 'ai',
        content: 'Hi there!',
      },
    ] as unknown as LangChainMessage[];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
  });

  it('normalizes messages with type property', () => {
    const messages: LangChainMessage[] = [
      { type: 'human', content: 'Hello' },
      { type: 'ai', content: 'Hi!' },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('normalizes messages with role property', () => {
    const messages: LangChainMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('normalizes serialized LangChain format', () => {
    const messages: LangChainMessage[] = [
      {
        lc: 1,
        id: ['langchain_core', 'messages', 'HumanMessage'],
        kwargs: { content: 'Hello from serialized' },
      },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([{ role: 'user', content: 'Hello from serialized' }]);
  });

  describe('multimodal content media stripping', () => {
    const b64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAUA' + 'A'.repeat(200);
    const BLOB_SUBSTITUTE = '[Blob substitute]';

    it('strips base64 image_url from multimodal array content via _getType()', () => {
      const messages = [
        {
          _getType: () => 'human',
          content: [
            { type: 'text', text: 'What color is in this image?' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Data}` } },
          ],
        },
      ] as unknown as LangChainMessage[];

      const result = normalizeLangChainMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe('user');

      const parsed = JSON.parse(result[0]!.content);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ type: 'text', text: 'What color is in this image?' });
      expect(parsed[1].image_url.url).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('strips base64 data from Anthropic-style source blocks', () => {
      const messages = [
        {
          _getType: () => 'human',
          content: [
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: b64Data,
              },
            },
          ],
        },
      ] as unknown as LangChainMessage[];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].source.data).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('strips base64 from inline_data (Google GenAI style)', () => {
      const messages: LangChainMessage[] = [
        {
          type: 'human',
          content: [
            { type: 'text', text: 'Describe' },
            { inlineData: { mimeType: 'image/png', data: b64Data } },
          ] as unknown as string,
        },
      ];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].inlineData.data).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('strips base64 from input_audio content parts', () => {
      const messages = [
        {
          _getType: () => 'human',
          content: [
            { type: 'text', text: 'What do you hear?' },
            { type: 'input_audio', input_audio: { data: b64Data } },
          ],
        },
      ] as unknown as LangChainMessage[];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].input_audio.data).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('preserves text-only array content without modification', () => {
      const messages = [
        {
          _getType: () => 'human',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
        },
      ] as unknown as LangChainMessage[];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed).toEqual([
        { type: 'text', text: 'First part' },
        { type: 'text', text: 'Second part' },
      ]);
    });

    it('strips media from serialized LangChain format with array content', () => {
      const messages: LangChainMessage[] = [
        {
          lc: 1,
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: [
              { type: 'text', text: 'Describe this' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Data}` } },
            ] as unknown as string,
          },
        },
      ];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].image_url.url).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('strips media from messages with role property and array content', () => {
      const messages: LangChainMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64Data}` } },
          ] as unknown as string,
        },
      ];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].image_url.url).toBe(BLOB_SUBSTITUTE);
      expect(result[0]!.content).not.toContain(b64Data);
    });

    it('strips media from messages with type property and array content', () => {
      const messages: LangChainMessage[] = [
        {
          type: 'human',
          content: [
            { type: 'text', text: 'Check this' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Data}` } },
          ] as unknown as string,
        },
      ];

      const result = normalizeLangChainMessages(messages);
      const parsed = JSON.parse(result[0]!.content);
      expect(parsed[1].image_url.url).toBe(BLOB_SUBSTITUTE);
    });
  });
});

describe('extractChatModelRequestAttributes with multimodal content', () => {
  const b64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAUA' + 'A'.repeat(200);

  it('strips base64 from input messages attribute', () => {
    const serialized = { id: ['langchain', 'chat_models', 'openai'], name: 'ChatOpenAI' };
    const messages: LangChainMessage[][] = [
      [
        {
          _getType: () => 'human',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Data}` } },
          ],
        } as unknown as LangChainMessage,
      ],
    ];

    const attrs = extractChatModelRequestAttributes(serialized, messages, true);
    const inputMessages = attrs[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] as string | undefined;

    expect(inputMessages).toBeDefined();
    expect(inputMessages).not.toContain(b64Data);
    expect(inputMessages).toContain('[Blob substitute]');
    expect(inputMessages).toContain('What is in this image?');
  });
});
