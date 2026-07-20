import { simulateReadableStream } from 'ai';

function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return simulateReadableStream({
    initialDelayInMs: 0,
    chunkDelayInMs: 0,
    chunks: events.map(event => encoder.encode(`data: ${event}\n\n`)),
  });
}

/**
 * Minimal mock of the Cloudflare Workers AI binding (`env.AI`) that emits the
 * OpenAI-compatible streaming shape (`choices[].delta.content`) — the format models
 * routed through `workers-ai-provider` stream when driven by an `AIChatAgent`.
 */
export class MockAi {
  public async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    await new Promise(resolve => setTimeout(resolve, 10));

    if (inputs?.stream === true) {
      return createSseStream([
        '{"choices":[{"index":0,"delta":{"content":"The capital "},"finish_reason":null}]}',
        '{"choices":[{"index":0,"delta":{"content":"of France "},"finish_reason":null}]}',
        '{"choices":[{"index":0,"delta":{"content":"is Paris."},"finish_reason":"stop"}]}',
        '{"usage":{"prompt_tokens":15,"completion_tokens":8,"total_tokens":23}}',
        '[DONE]',
      ]);
    }

    return {
      response: 'The capital of France is Paris.',
      usage: {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23,
      },
    };
  }
}
