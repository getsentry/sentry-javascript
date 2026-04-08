import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated)

    // Test 1: Messages array with large last message that gets truncated
    // Only the last message should be kept, and it should be truncated to only Cs
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
          text: 'Response to truncated messages',
        }),
      }),
      messages: [
        { role: 'user', content: largeContent1 },
        { role: 'assistant', content: largeContent2 },
        { role: 'user', content: largeContent3 },
      ],
    });

    // Test 2: Messages array where last message is small and kept intact
    const smallContent = 'This is a small message that fits within the limit';
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
          text: 'Response to small message',
        }),
      }),
      messages: [
        { role: 'user', content: largeContent1 },
        { role: 'assistant', content: largeContent2 },
        { role: 'user', content: smallContent },
      ],
    });
  });
}

run();
