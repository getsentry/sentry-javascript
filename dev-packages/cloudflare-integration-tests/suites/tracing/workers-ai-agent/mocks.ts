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
 * OpenAI-compatible streaming shape (`choices[].delta.content`).
 *
 * This is the format `workers-ai-provider` receives from `binding.run(..., { stream: true })`
 * for models routed through the OpenAI-compatible endpoint (which the Agents SDK uses).
 * The native `{ response }` shape is already covered by the `workers-ai` suite.
 */
export class MockAi {
  public async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    await new Promise(resolve => setTimeout(resolve, 10));

    if (inputs?.stream === true) {
      return createSseStream([
        '{"choices":[{"index":0,"delta":{"content":"The capital "},"finish_reason":null}]}',
        '{"choices":[{"index":0,"delta":{"content":"of France "},"finish_reason":null}]}',
        '{"choices":[{"index":0,"delta":{"content":"is Paris."},"finish_reason":"stop"}]}',
        '{"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}',
        '[DONE]',
      ]);
    }

    return {
      response: 'The capital of France is Paris.',
      usage: {
        prompt_tokens: 12,
        completion_tokens: 7,
        total_tokens: 19,
      },
    };
  }
}
