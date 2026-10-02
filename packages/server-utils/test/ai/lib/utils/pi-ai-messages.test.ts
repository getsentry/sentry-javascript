import { describe, expect, it } from 'vitest';
import {
  piAiAssistantMessageToGenAiMessage,
  piAiContentToString,
  piAiFinishReason,
  piAiMessagesToGenAiMessages,
  piAiSystemInstructions,
  piAiToolDefinitions,
} from '../../../../src/ai/pi-ai/messages';

describe('convert pi-ai messages to gen_ai messages', () => {
  it('maps user, assistant and tool result messages', () => {
    expect(
      piAiMessagesToGenAiMessages([
        { role: 'user', content: 'Weather in Vienna?', timestamp: 1 },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'The user wants the weather.' },
            { type: 'text', text: 'Let me check.' },
            { type: 'toolCall', id: 'call_1', name: 'get_weather', arguments: { city: 'Vienna' } },
          ],
          stopReason: 'toolUse',
        },
        {
          role: 'toolResult',
          toolCallId: 'call_1',
          toolName: 'get_weather',
          content: [{ type: 'text', text: 'Sunny in Vienna.' }],
          isError: false,
        },
      ]),
    ).toStrictEqual([
      { role: 'user', parts: [{ type: 'text', content: 'Weather in Vienna?' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'reasoning', content: 'The user wants the weather.' },
          { type: 'text', content: 'Let me check.' },
          { type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
        ],
      },
      {
        role: 'tool',
        parts: [{ type: 'tool_call_response', id: 'call_1', name: 'get_weather', result: 'Sunny in Vienna.' }],
      },
    ]);
  });

  it('reports images by media type and drops their base64 data', () => {
    expect(
      piAiMessagesToGenAiMessages([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
          ],
        },
      ]),
    ).toStrictEqual([
      {
        role: 'user',
        parts: [
          { type: 'text', content: 'What is this?' },
          { type: 'blob', mime_type: 'image/png' },
        ],
      },
    ]);
  });

  it('leaves out system messages, redacted thinking and messages without content', () => {
    expect(
      piAiMessagesToGenAiMessages([
        { role: 'system', content: '', sections: { preamble: 'You are helpful.' } },
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'c2VjcmV0', redacted: true }] },
        { role: 'user', content: '' },
        'not a message',
      ]),
    ).toStrictEqual([]);
  });

  it('drops empty text blocks, which would hide the tool calls next to them', () => {
    expect(
      piAiMessagesToGenAiMessages([
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: '  \n' },
            { type: 'toolCall', id: 'call_1', name: 'get_weather', arguments: {} },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: '' }] },
      ]),
    ).toStrictEqual([
      { role: 'assistant', parts: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{}' }] },
    ]);
  });

  it('maps the tool-calling stop reason to the conventions and passes the others through', () => {
    expect(piAiFinishReason('toolUse')).toBe('tool_call');
    expect(piAiFinishReason('stop')).toBe('stop');
    expect(piAiFinishReason('aborted')).toBe('aborted');
    expect(piAiFinishReason(undefined)).toBeUndefined();
    expect(piAiFinishReason('')).toBeUndefined();
  });

  it('keeps unknown part kinds as objects', () => {
    expect(piAiMessagesToGenAiMessages([{ role: 'user', content: [{ type: 'audio', url: 'a.mp3' }] }])).toStrictEqual([
      { role: 'user', parts: [{ type: 'object', content: { type: 'audio', url: 'a.mp3' } }] },
    ]);
  });

  it('maps an assistant message to an output message with its finish reason', () => {
    expect(
      piAiAssistantMessageToGenAiMessage(
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call_1', name: 'get_weather', arguments: { city: 'Vienna' } }],
        },
        'tool_call',
      ),
    ).toStrictEqual({
      role: 'assistant',
      parts: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Vienna"}' }],
      finish_reason: 'tool_call',
    });
    expect(piAiAssistantMessageToGenAiMessage({ role: 'assistant', content: [] }, 'stop')).toBeUndefined();
  });

  it('replays positional system messages into the current system prompt and tools', () => {
    const context = {
      systemPrompt: 'Base prompt.',
      tools: [{ name: 'read' }],
      messages: [
        {
          role: 'system',
          content: '',
          sections: { preamble: 'You help.', mode: 'Edit.' },
          toolsAdded: [{ name: 'bash' }],
        },
        { role: 'user', content: 'Hi.' },
        { role: 'system', content: '', sections: { mode: null }, toolsRemoved: [{ name: 'read' }] },
        { role: 'system', content: 'Appended.', sections: { mode: 'Plan only.' } },
      ],
    };

    expect(piAiSystemInstructions(context)).toBe('Base prompt.\n\nAppended.\n\nYou help.\n\nPlan only.');
    expect(piAiToolDefinitions(context)).toStrictEqual([{ name: 'bash' }]);
    expect(piAiSystemInstructions({ messages: [{ role: 'user', content: 'Hi.' }] })).toBeUndefined();
  });

  it('renders text-only content as text and other content as mapped parts', () => {
    expect(
      piAiContentToString([
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ]),
    ).toBe('line 1\nline 2');
    expect(piAiContentToString([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }])).toBe(
      '[{"type":"blob","mime_type":"image/png"}]',
    );
  });
});
