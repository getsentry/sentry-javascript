import { describe, expect, it } from 'vitest';
import type { ContentListUnion } from '../../../../src/ai/google-genai/utils';
import { contentUnionToMessages, systemInstructionToText } from '../../../../src/ai/google-genai/utils';

describe('convert google-genai content to gen_ai messages', () => {
  it('converts strings to messages', () => {
    expect(contentUnionToMessages('hello', 'system')).toStrictEqual([
      { role: 'system', parts: [{ type: 'text', content: 'hello' }] },
    ]);
    expect(contentUnionToMessages('hello')).toStrictEqual([
      { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
    ]);
  });

  it('collects an array of bare parts into a single message', () => {
    expect(contentUnionToMessages(['hello', 'goodbye'], 'system')).toStrictEqual([
      {
        role: 'system',
        parts: [
          { type: 'text', content: 'hello' },
          { type: 'text', content: 'goodbye' },
        ],
      },
    ]);
  });

  it('keeps a multimodal turn as one message and redacts the binary payload', () => {
    expect(
      contentUnionToMessages([
        { text: 'What is in this image?' },
        { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } },
      ]),
    ).toStrictEqual([
      {
        role: 'user',
        parts: [
          { type: 'text', content: 'What is in this image?' },
          { type: 'blob', mime_type: 'image/png' },
        ],
      },
    ]);
  });

  it('maps the `model` role to `assistant`', () => {
    expect(
      contentUnionToMessages([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ]),
    ).toStrictEqual([
      { role: 'user', parts: [{ type: 'text', content: 'Hello' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'Hi there' }] },
    ]);
  });

  it('converts function calls and function responses', () => {
    expect(
      contentUnionToMessages([
        {
          role: 'model',
          parts: [{ functionCall: { id: 'call-1', name: 'get_current_time', args: { timezone: 'Asia/Tokyo' } } }],
        },
        {
          role: 'user',
          parts: [{ functionResponse: { id: 'call-1', name: 'get_current_time', response: { output: '10:00' } } }],
        },
      ]),
    ).toStrictEqual([
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'call-1', name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' }],
      },
      {
        role: 'user',
        parts: [{ type: 'tool_call_response', id: 'call-1', name: 'get_current_time', result: '{"output":"10:00"}' }],
      },
    ]);
  });

  it('marks thought parts as reasoning', () => {
    expect(
      contentUnionToMessages({ role: 'model', parts: [{ text: 'Let me think', thought: true }, { text: 'Done' }] }),
    ).toStrictEqual([
      {
        role: 'assistant',
        parts: [
          { type: 'reasoning', content: 'Let me think' },
          { type: 'text', content: 'Done' },
        ],
      },
    ]);
  });

  it('falls back to an object part for part kinds it does not know', () => {
    expect(contentUnionToMessages([{ executableCode: { code: 'print(1)' } }])).toStrictEqual([
      { role: 'user', parts: [{ type: 'object', content: { executableCode: { code: 'print(1)' } } }] },
    ]);
  });

  it('handles unexpected formats safely', () => {
    expect(
      contentUnionToMessages([
        { parts: ['hello', 'goodbye'], role: 'agent' },
        null,
        21345,
        { data: 'this is content' },
      ] as ContentListUnion),
    ).toStrictEqual([
      {
        role: 'agent',
        parts: [
          { type: 'text', content: 'hello' },
          { type: 'text', content: 'goodbye' },
        ],
      },
      { role: 'user', parts: [{ type: 'object', content: { data: 'this is content' } }] },
    ]);
  });
});

describe('systemInstructionToText', () => {
  it('reads a plain string instruction', () => {
    expect(systemInstructionToText('You are a helpful assistant')).toBe('You are a helpful assistant');
  });

  it('reads an instruction given as a Content object', () => {
    expect(systemInstructionToText({ parts: [{ text: 'You are a helpful assistant' }] })).toBe(
      'You are a helpful assistant',
    );
    expect(systemInstructionToText({ role: 'system', parts: [{ text: 'Be brief' }, { text: 'Be kind' }] })).toBe(
      'Be brief\nBe kind',
    );
  });

  it('returns undefined when there is no text to report', () => {
    expect(
      systemInstructionToText({ parts: [{ inlineData: { mimeType: 'image/png', data: 'AAA=' } }] }),
    ).toBeUndefined();
  });
});
