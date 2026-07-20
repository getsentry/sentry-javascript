import { describe, expect, it } from 'vitest';
import type { Span } from '../../../src';
import {
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { instrumentWorkersAiStream } from '../../../src/tracing/workers-ai/streaming';

function createMockSpan(): { span: Span; attributes: Record<string, unknown>; ended: () => boolean } {
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
  return { span, attributes, ended: () => isEnded };
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const queued = [...chunks];
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queued.shift();
      if (next === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next));
    },
  });
}

describe('instrumentWorkersAiStream', () => {
  it('passes the original bytes through untouched', async () => {
    const { span } = createMockSpan();
    const raw = 'data: {"response":"Hello"}\n\ndata: [DONE]\n\n';

    const instrumented = instrumentWorkersAiStream(streamFromChunks([raw]), span, true);
    const passedThrough = await new Response(instrumented).text();

    expect(passedThrough).toBe(raw);
  });

  it('accumulates response text and usage across SSE events split across read boundaries', async () => {
    const { span, attributes, ended } = createMockSpan();
    // The second event is deliberately split mid-line across two reads.
    const chunks = [
      'data: {"response":"The capital "}\n\ndata: {"respo',
      'nse":"of France "}\n\ndata: {"response":"is Paris."',
      ',"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, true);
    await new Response(instrumented).text();

    expect(attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toBe(true);
    expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBe('The capital of France is Paris.');
    expect(attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toBe(12);
    expect(attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toBe(7);
    expect(attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toBe(19);
    expect(ended()).toBe(true);
  });

  it('records usage but not response text when recordOutputs is false', async () => {
    const { span, attributes } = createMockSpan();
    const chunks = [
      'data: {"response":"secret"}\n\n',
      'data: {"response":"","usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, false);
    await new Response(instrumented).text();

    expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeUndefined();
    expect(attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toBe(1);
  });

  it('ignores malformed SSE payloads without throwing', async () => {
    const { span, attributes, ended } = createMockSpan();
    const chunks = ['data: not-json\n\n', 'data: {"response":"ok"}\n\ndata: [DONE]\n\n'];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, true);
    await new Response(instrumented).text();

    expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBe('ok');
    expect(ended()).toBe(true);
  });

  // Models routed through the OpenAI-compatible endpoint (e.g. via `workers-ai-provider`,
  // which the Cloudflare Agents SDK uses) stream `choices[].delta.content` instead of the
  // native top-level `response` field. Usage still arrives top-level, which is why the
  // pre-fix parser captured tokens but dropped the response text entirely.
  it('accumulates response text from OpenAI-compatible choices[].delta.content chunks', async () => {
    const { span, attributes, ended } = createMockSpan();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"The capital "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"of France "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"is Paris."},"finish_reason":"stop"}]}\n\n',
      'data: {"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, true);
    await new Response(instrumented).text();

    expect(attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toBe(true);
    expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBe('The capital of France is Paris.');
    expect(attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toBe(12);
    expect(attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toBe(7);
    expect(attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toBe(19);
    expect(ended()).toBe(true);
  });

  it('assembles fragmented OpenAI-compatible tool calls from choices[].delta.tool_calls', async () => {
    const { span, attributes } = createMockSpan();
    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"getRepoInfo","arguments":"{\\"owner\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"cloudflare\\",\\"name\\":\\"agents\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, true);
    await new Response(instrumented).text();

    const toolCalls = JSON.parse(attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] as string);
    expect(toolCalls).toEqual([
      {
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'getRepoInfo', arguments: '{"owner":"cloudflare","name":"agents"}' },
      },
    ]);

    // The product reads model output from `gen_ai.output.messages`; tool calls must appear there too.
    expect(JSON.parse(attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE] as string)).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'call_1',
            name: 'getRepoInfo',
            arguments: '{"owner":"cloudflare","name":"agents"}',
          },
        ],
      },
    ]);
  });

  // Some Workers AI models (e.g. `@cf/moonshotai/kimi-k2.6`) stream tool calls with the
  // name/arguments at the top level of the tool-call object rather than nested under `function`.
  it('assembles tool calls whose name/arguments are at the top level of the delta', async () => {
    const { span, attributes } = createMockSpan();
    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","name":"getRepoInfo","arguments":"{\\"owner\\":"}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"arguments":"\\"cloudflare\\"}"}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, true);
    await new Response(instrumented).text();

    const toolCalls = JSON.parse(attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] as string);
    expect(toolCalls).toEqual([
      {
        index: 0,
        id: 'call_1',
        type: undefined,
        function: { name: 'getRepoInfo', arguments: '{"owner":"cloudflare"}' },
      },
    ]);

    expect(JSON.parse(attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE] as string)).toEqual([
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'call_1', name: 'getRepoInfo', arguments: '{"owner":"cloudflare"}' }],
      },
    ]);
  });

  it('does not record OpenAI-compatible output when recordOutputs is false', async () => {
    const { span, attributes } = createMockSpan();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"secret"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\ndata: [DONE]\n\n',
    ];

    const instrumented = instrumentWorkersAiStream(streamFromChunks(chunks), span, false);
    await new Response(instrumented).text();

    expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeUndefined();
    expect(attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeUndefined();
    expect(attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();
    expect(attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toBe(1);
  });

  it('ends the span when the consumer cancels the stream', async () => {
    const { span, attributes, ended } = createMockSpan();

    const instrumented = instrumentWorkersAiStream(streamFromChunks(['data: {"response":"partial"}\n\n']), span, true);

    const reader = instrumented.getReader();
    await reader.read();
    await reader.cancel('no longer needed');

    expect(ended()).toBe(true);
    expect(attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toBe(true);
  });
});
