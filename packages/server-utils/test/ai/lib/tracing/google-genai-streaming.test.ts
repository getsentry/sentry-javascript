import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import { GEN_AI_RESPONSE_TOOL_CALLS } from '@sentry/conventions/attributes';
import { addResponseAttributes } from '../../../../src/ai/google-genai/index';
import { instrumentStream } from '../../../../src/ai/google-genai/streaming';
import type { ContentPart, GoogleGenAIResponse } from '../../../../src/ai/google-genai/types';

function createMockSpan(): { span: Span; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  let isEnded = false;
  const span = {
    isRecording: () => !isEnded,
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
    setAttributes: (attrs: Record<string, unknown>) => {
      Object.assign(attributes, attrs);
    },
    setStatus: () => {},
    end: () => {
      isEnded = true;
    },
  } as unknown as Span;
  return { span, attributes };
}

// Mirrors the real `@google/genai` response object: `functionCalls` is a getter that reads the
// function-call parts of the first candidate, i.e. the very same parts exposed under
// `candidates[].content.parts`. A chunk therefore surfaces each tool call through both accessors.
function chunkWithParts(parts: ContentPart[], extra: Record<string, unknown> = {}): GoogleGenAIResponse {
  const chunk = {
    candidates: [{ content: { parts, role: 'model' }, index: 0 }],
    ...extra,
  } as Record<string, unknown>;
  Object.defineProperty(chunk, 'functionCalls', {
    enumerable: false,
    get() {
      const calls = parts.map(part => part.functionCall).filter(fc => fc !== undefined);
      return calls.length ? calls : undefined;
    },
  });
  return chunk as GoogleGenAIResponse;
}

async function* streamOf(chunks: GoogleGenAIResponse[]): AsyncGenerator<GoogleGenAIResponse> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function drain(stream: AsyncGenerator<GoogleGenAIResponse>): Promise<void> {
  for await (const _ of stream) {
    void _;
  }
}

describe('instrumentStream (google-genai tool calls)', () => {
  it('records exactly one entry per streamed tool call, in the native function-call shape', async () => {
    const { span, attributes } = createMockSpan();

    const functionCall = {
      id: 'call_light_stream_1',
      name: 'controlLight',
      args: { brightness: 0.5, colorTemperature: 'cool' },
    };

    const chunks = [
      chunkWithParts([{ text: 'Let me control the lights for you.' }], { responseId: 'resp-1' }),
      chunkWithParts([{ functionCall }]),
      chunkWithParts([{ text: ' Done!' }], {
        candidates: [{ content: { parts: [{ text: ' Done!' }], role: 'model' }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 10, totalTokenCount: 22 },
      }),
    ];

    await drain(instrumentStream(streamOf(chunks), span, true));

    const raw = attributes[GEN_AI_RESPONSE_TOOL_CALLS];
    expect(raw).toBeDefined();
    const toolCalls = JSON.parse(raw as string) as Array<Record<string, unknown>>;

    // A single real tool call must yield a single entry (the pre-fix code double-dipped and produced two).
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toEqual(functionCall);
    // No entry should carry the divergent `arguments` shape the duplicate push used to emit.
    expect(toolCalls.every(call => !('arguments' in call))).toBe(true);
  });

  it('records one entry per call when several tool calls arrive across chunks', async () => {
    const { span, attributes } = createMockSpan();

    const first = { id: 'c1', name: 'controlLight', args: { brightness: 0.2 } };
    const second = { id: 'c2', name: 'setColor', args: { color: 'red' } };

    const chunks = [chunkWithParts([{ functionCall: first }]), chunkWithParts([{ functionCall: second }])];

    await drain(instrumentStream(streamOf(chunks), span, true));

    const toolCalls = JSON.parse(attributes[GEN_AI_RESPONSE_TOOL_CALLS] as string) as Array<Record<string, unknown>>;
    expect(toolCalls).toEqual([first, second]);
  });

  it('does not record tool calls when recordOutputs is false', async () => {
    const { span, attributes } = createMockSpan();

    const chunks = [chunkWithParts([{ functionCall: { id: 'c1', name: 'controlLight', args: { brightness: 1 } } }])];

    await drain(instrumentStream(streamOf(chunks), span, false));

    expect(attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBeUndefined();
  });

  it('non-streaming addResponseAttributes still records one entry per call in the same shape', () => {
    const { span, attributes } = createMockSpan();

    const functionCall = {
      id: 'call_light_control_1',
      name: 'controlLight',
      args: { brightness: 0.3, colorTemperature: 'warm' },
    };
    const response = chunkWithParts([{ text: 'I need to check the light status first.' }, { functionCall }]);

    addResponseAttributes(span, response, true);

    const toolCalls = JSON.parse(attributes[GEN_AI_RESPONSE_TOOL_CALLS] as string) as Array<Record<string, unknown>>;
    expect(toolCalls).toEqual([functionCall]);
  });
});
