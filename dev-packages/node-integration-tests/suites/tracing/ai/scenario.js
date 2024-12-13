const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { generateText } = require('ai');
const { MockLanguageModelV1 } = require('ai/test');

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'First span here!',
        }),
      }),
      prompt: 'Where is the first span?',
    });

    // This span should have input and output prompts attached because telemetry is explicitly enabled.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'Second span here!',
        }),
      }),
      prompt: 'Where is the second span?',
    });

    // This span should not be captured because we've disabled telemetry
    await generateText({
      experimental_telemetry: { isEnabled: false },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'Third span here!',
        }),
      }),
      prompt: 'Where is the third span?',
    });
  });
}

run();
