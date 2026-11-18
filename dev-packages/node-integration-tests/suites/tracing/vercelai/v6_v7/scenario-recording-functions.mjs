import * as Sentry from '@sentry/node';
import { generateText, streamText } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';

const finishReason = { unified: 'stop', raw: 'stop' };
const usage = {
  inputTokens: { total: 10, noCache: 10, cached: 0 },
  outputTokens: { total: 20, noCache: 20, cached: 0 },
  totalTokens: { total: 30, noCache: 30, cached: 0 },
};

function chat(privacy) {
  return Sentry.withScope(async scope => {
    scope.setTag('privacy', privacy);
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({ finishReason, usage, content: [{ type: 'text', text: 'Paris.' }], warnings: [] }),
      }),
      prompt: `Capital of France? (${privacy})`,
    });
  });
}

function stream() {
  return Sentry.withScope(async scope => {
    scope.setTag('privacy', 'public');
    const result = streamText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Stream ' },
              { type: 'text-delta', id: '0', delta: 'response!' },
              { type: 'text-end', id: '0' },
              { type: 'finish', finishReason, usage },
            ],
          }),
        }),
      }),
      prompt: 'Stream me a response',
    });

    for await (const part of result.fullStream) {
      // Both spans have started once the model streams text, so this must not change what they record.
      if (part.type === 'text-delta') {
        scope.setTag('privacy', 'private');
      }
    }
  });
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await chat('public');
    await chat('private');
    await stream();
  });
}

run();
