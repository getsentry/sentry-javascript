import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const controller = new AbortController();

    // Abort the moment the model is asked for a stream, so the operation fails before its first
    // chunk. `fetch()` rejects with the signal's reason on abort, and `@hono/node-server` aborts
    // with a plain string — so there is no `AbortError` name to suppress by.
    const model = new MockLanguageModelV3({
      doStream: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
          controller.abort('Client connection prematurely closed.');
        }),
    });

    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      maxRetries: 0,
      model,
      prompt: 'Stream me a response',
      abortSignal: controller.signal,
    });

    for await (const _part of result.textStream) {
      void _part;
    }
  });
}

run();
