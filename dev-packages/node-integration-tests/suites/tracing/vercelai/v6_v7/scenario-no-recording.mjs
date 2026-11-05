import * as Sentry from '@sentry/node';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

const telemetry = { isEnabled: true, recordInputs: false, recordOutputs: false };
const finishReason = { unified: 'tool-calls', raw: 'tool_calls' };
const usage = {
  inputTokens: { total: 10, noCache: 10, cached: 0 },
  outputTokens: { total: 20, noCache: 20, cached: 0 },
  totalTokens: { total: 30, noCache: 30, cached: 0 },
};
const toolCall = {
  type: 'tool-call',
  toolCallId: 'call-1',
  toolName: 'getWeather',
  input: JSON.stringify({ location: 'San Francisco' }),
};
const tools = {
  getWeather: tool({
    inputSchema: z.object({ location: z.string() }),
    execute: async () => {
      throw new Error('Error in tool');
    },
  }),
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      telemetry,
      tools,
      prompt: 'What is the weather in San Francisco?',
      model: new MockLanguageModelV3({
        doGenerate: async () => ({ finishReason, usage, content: [toolCall], warnings: [] }),
      }),
    });

    const result = streamText({
      telemetry,
      tools,
      stopWhen: stepCountIs(1),
      prompt: 'What is the weather in San Francisco?',
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [{ type: 'stream-start', warnings: [] }, toolCall, { type: 'finish', finishReason, usage }],
          }),
        }),
      }),
    });
    await result.consumeStream();
  });
}

run();
