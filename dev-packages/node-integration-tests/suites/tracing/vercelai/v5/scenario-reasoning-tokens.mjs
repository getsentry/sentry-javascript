import * as Sentry from '@sentry/node';
import { generateText, simulateReadableStream, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

// `@ai-sdk/google` 2.x reports candidate-only `outputTokens` and a separate `reasoningTokens`, with the
// raw counts in `providerMetadata`. Two steps reason 80 and 100 tokens.
const STEPS = [
  { candidates: 20, thoughts: 80, finishReason: 'tool-calls' },
  { candidates: 20, thoughts: 100, finishReason: 'stop' },
];

function usage({ candidates, thoughts }) {
  return {
    inputTokens: 10,
    outputTokens: candidates,
    totalTokens: 10 + candidates + thoughts,
    reasoningTokens: thoughts,
  };
}

function providerMetadata({ candidates, thoughts }) {
  return {
    google: {
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: candidates,
        thoughtsTokenCount: thoughts,
        totalTokenCount: 10 + candidates + thoughts,
      },
    },
  };
}

const tools = {
  getWeather: tool({
    description: 'Get the current weather for a location',
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
  }),
};

const toolCall = {
  type: 'tool-call',
  toolCallId: 'call-1',
  toolName: 'getWeather',
  input: JSON.stringify({ location: 'San Francisco' }),
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    let generateCalls = 0;
    await generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => {
          const step = STEPS[generateCalls++];
          return {
            finishReason: step.finishReason,
            usage: usage(step),
            content: generateCalls === 1 ? [toolCall] : [{ type: 'text', text: 'Sunny, 72°F.' }],
            warnings: [],
            providerMetadata: providerMetadata(step),
          };
        },
      }),
      tools,
      stopWhen: stepCountIs(5),
      prompt: 'What is the weather in San Francisco?',
    });

    let streamCalls = 0;
    const result = streamText({
      model: new MockLanguageModelV2({
        doStream: async () => {
          const step = STEPS[streamCalls++];
          const content =
            streamCalls === 1
              ? [toolCall]
              : [
                  { type: 'text-start', id: '0' },
                  { type: 'text-delta', id: '0', delta: 'Sunny, 72°F.' },
                  { type: 'text-end', id: '0' },
                ];
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                ...content,
                {
                  type: 'finish',
                  finishReason: step.finishReason,
                  usage: usage(step),
                  providerMetadata: providerMetadata(step),
                },
              ],
            }),
          };
        },
      }),
      tools,
      stopWhen: stepCountIs(5),
      prompt: 'What is the weather in San Francisco?',
    });
    for await (const _part of result.fullStream) {
      void _part;
    }

    // `@ai-sdk/openai` 2.x reports reasoning only in the usage, inside an output that includes it.
    await generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 50, totalTokens: 60, reasoningTokens: 30 },
          content: [{ type: 'text', text: 'Sunny.' }],
          warnings: [],
          providerMetadata: { openai: {} },
        }),
      }),
      prompt: 'What is the weather in San Francisco?',
    });
  });
}

run();
