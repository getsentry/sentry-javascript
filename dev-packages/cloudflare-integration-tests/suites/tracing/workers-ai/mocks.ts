function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${events[index]}\n\n`));
      index += 1;
    },
  });
}

/**
 * Minimal mock of the Cloudflare Workers AI binding (`env.AI`).
 */
export class MockAi {
  public async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    if (model === 'error-model') {
      const error = new Error('Model not found');
      (error as unknown as { status: number }).status = 404;
      throw error;
    }

    if (inputs?.stream === true) {
      return createSseStream([
        '{"response":"The capital "}',
        '{"response":"of France "}',
        '{"response":"is Paris."}',
        '{"response":"","usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}',
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
