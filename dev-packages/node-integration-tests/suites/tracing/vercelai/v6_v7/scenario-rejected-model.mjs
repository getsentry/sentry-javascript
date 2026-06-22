import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    try {
      await generateText({
        experimental_telemetry: { isEnabled: true },
        // Don't retry — we want a single, clean rejection.
        maxRetries: 0,
        model: new MockLanguageModelV3({
          doGenerate: async () => {
            throw new Error('model exploded');
          },
        }),
        prompt: 'This will reject',
      });
    } catch {
      // Expected: the model rejects. We only care that the spans were finished.
    }
  });
}

run();
