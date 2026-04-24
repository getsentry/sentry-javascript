import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Single long message so truncation must crop it
    const longContent = 'A'.repeat(50_000);
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
          text: 'Response',
        }),
      }),
      messages: [{ role: 'user', content: longContent }],
    });
  });

  // Flush is required when span streaming is enabled to ensure streamed spans are sent before the process exits
  await Sentry.flush(2000);
}

run();
