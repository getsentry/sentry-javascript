import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // A model whose first response never arrives before the abort, like a real provider still
    // waiting on response headers. It rejects with the signal's reason, which is what `fetch()`
    // does when its signal aborts.
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

    // `@hono/node-server` aborts with a plain string when the client disconnects, so the reason is
    // not an `AbortError` and can't be suppressed by name.
    setTimeout(() => controller.abort('Client connection prematurely closed.'), 50);

    // Consuming `textStream` is fully handled: it ends quietly on abort.
    for await (const _part of result.textStream) {
      void _part;
    }
  });

  await new Promise(resolve => setTimeout(resolve, 300));
}

run();
