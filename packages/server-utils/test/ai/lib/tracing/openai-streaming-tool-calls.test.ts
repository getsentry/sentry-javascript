import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import { GEN_AI_RESPONSE_TOOL_CALLS } from '@sentry/conventions/attributes';
import { instrumentStream } from '../../../../src/ai/openai/streaming';
import type { ChatCompletionChunk, ChatCompletionToolCall } from '../../../../src/ai/openai/types';

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

function chunkWith(toolCalls: Array<Partial<ChatCompletionToolCall>>): ChatCompletionChunk {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    model: 'gemini-test',
    choices: [{ index: 0, delta: { tool_calls: toolCalls } }],
  } as unknown as ChatCompletionChunk;
}

async function recordedToolCalls(chunks: ChatCompletionChunk[]): Promise<Array<Record<string, unknown>>> {
  const { span, attributes } = createMockSpan();
  async function* stream(): AsyncGenerator<ChatCompletionChunk> {
    yield* chunks;
  }
  for await (const _ of instrumentStream(stream(), span, true)) {
    void _;
  }
  return JSON.parse(attributes[GEN_AI_RESPONSE_TOOL_CALLS] as string) as Array<Record<string, unknown>>;
}

describe('instrumentStream (openai chat completion tool calls)', () => {
  it('keeps whole tool calls that carry an id and no index', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([
        { id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
        { id: 'call_b', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
      ]),
    ]);

    expect(toolCalls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
      { id: 'call_b', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
    ]);
  });

  it('joins argument fragments by id, then onto the latest call when there is no id', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":' } }]),
      chunkWith([{ id: 'call_a', function: { name: '', arguments: '"a"' } }]),
      chunkWith([{ function: { name: '', arguments: '}' } }]),
    ]);

    expect(toolCalls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
    ]);
  });

  it('keeps named calls that have neither id nor index', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ function: { name: 'lookup', arguments: '{}' } }]),
      chunkWith([{ function: { name: 'search', arguments: '{}' } }]),
    ]);

    expect(toolCalls.map(call => (call.function as { name: string }).name)).toEqual(['lookup', 'search']);
  });

  it('does not let a later real index overwrite an earlier call without one', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ id: 'call_b', type: 'function', function: { name: 'search', arguments: '{}' } }]),
      chunkWith([{ index: 0, id: 'call_a', function: { name: 'lookup', arguments: '{}' } }]),
    ]);

    expect(toolCalls.map(call => call.id)).toEqual(['call_b', 'call_a']);
  });

  it('still groups indexed deltas by index', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ index: 0, id: 'call_a', function: { name: 'lookup', arguments: '{}' } }]),
      chunkWith([{ index: 1, id: 'call_b', function: { name: 'search', arguments: '{' } }]),
      chunkWith([{ index: 1, function: { name: '', arguments: '}' } }]),
    ]);

    expect(toolCalls).toEqual([
      expect.objectContaining({ id: 'call_a', function: { name: 'lookup', arguments: '{}' } }),
      expect.objectContaining({ id: 'call_b', function: { name: 'search', arguments: '{}' } }),
    ]);
  });

  it('treats a null index like a missing one', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([
        { index: null, id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
        { index: null, id: 'call_b', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
      ]),
      chunkWith([{ index: null, function: { name: '', arguments: ' ' } }]),
    ]);

    expect(toolCalls.map(call => call.id)).toEqual(['call_a', 'call_b']);
    expect((toolCalls[1]?.function as { arguments: string }).arguments).toBe('{"q":"b"} ');
  });

  it('opens a new call when a different id lands on an index that is already taken', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([
        { index: 0, id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
        { index: 0, id: 'call_b', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
      ]),
    ]);

    expect(toolCalls).toEqual([
      { index: 0, id: 'call_a', type: 'function', function: { name: 'lookup', arguments: '{"q":"a"}' } },
      { index: 0, id: 'call_b', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
    ]);
  });

  it('continues the latest call opened on a reused index when the next delta has no id', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ index: 0, id: 'call_a', function: { name: 'lookup', arguments: '{}' } }]),
      chunkWith([{ index: 0, id: 'call_b', function: { name: 'search', arguments: '{"q":' } }]),
      chunkWith([{ index: 0, function: { name: '', arguments: '"b"}' } }]),
    ]);

    expect(toolCalls.map(call => (call.function as { arguments: string }).arguments)).toEqual(['{}', '{"q":"b"}']);
  });

  it('does not split a call whose id is repeated on every delta of its index', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([{ index: 0, id: 'call_a', function: { name: 'lookup', arguments: '{"q":' } }]),
      chunkWith([{ index: 0, id: 'call_a', function: { name: '', arguments: '"a"}' } }]),
    ]);

    expect(toolCalls).toHaveLength(1);
    expect((toolCalls[0]?.function as { arguments: string }).arguments).toBe('{"q":"a"}');
  });

  it('keeps the order calls were opened when a reused index is followed by a higher index', async () => {
    const toolCalls = await recordedToolCalls([
      chunkWith([
        { index: 0, id: 'call_a', function: { name: 'lookup', arguments: '{}' } },
        { index: 0, id: 'call_b', function: { name: 'search', arguments: '{}' } },
        { index: 1, id: 'call_c', function: { name: 'fetch', arguments: '{}' } },
      ]),
    ]);

    expect(toolCalls.map(call => call.id)).toEqual(['call_a', 'call_b', 'call_c']);
  });
});
