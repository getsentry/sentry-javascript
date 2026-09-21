import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // `fetch()` rejects with the signal's reason on abort, and `@hono/node-server` aborts with a
    // plain string — so there is no `AbortError` name to suppress by.
    const model = new MockLanguageModelV3({
      doStream: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        }),
    });

    const controller = new AbortController();
    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      maxRetries: 0,
      model,
      prompt: 'Stream me a response',
      abortSignal: controller.signal,
    });

    setTimeout(() => controller.abort('Client connection prematurely closed.'), 50);

    for await (const _part of result.textStream) {
      void _part;
    }
  });

  // Unhandled rejections are reported a turn later; don't let the process exit before that.
  await new Promise(resolve => setTimeout(resolve, 300));
}

run();
