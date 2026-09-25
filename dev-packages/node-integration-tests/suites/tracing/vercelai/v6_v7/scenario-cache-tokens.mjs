import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

// Calls routed through the Vercel AI Gateway carry a `gateway` key in `providerMetadata` instead of a
// provider name, so cache counts can only be derived from the SDK's normalized usage object.
async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 120, noCache: 20, cacheRead: 80, cacheWrite: 20 },
            outputTokens: { total: 10, noCache: 10, cached: 0 },
            totalTokens: { total: 130, noCache: 30, cached: 100 },
          },
          content: [{ type: 'text', text: 'Cache token span!' }],
          warnings: [],
          providerMetadata: {
            gateway: { routing: {} },
          },
        }),
      }),
      messages: [{ role: 'user', content: 'Tell me something' }],
    });
  });
}

run();
