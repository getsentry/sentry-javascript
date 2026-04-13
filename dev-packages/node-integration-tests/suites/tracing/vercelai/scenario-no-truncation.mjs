import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Multiple messages with long content (would normally be truncated and popped to last message only)
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
      messages: [
        { role: 'user', content: longContent },
        { role: 'assistant', content: 'Some reply' },
        { role: 'user', content: 'Follow-up question' },
      ],
    });
  });
}

run();
