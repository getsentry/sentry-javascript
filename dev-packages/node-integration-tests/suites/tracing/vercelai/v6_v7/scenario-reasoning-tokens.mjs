import * as Sentry from '@sentry/node';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

// Two Gemini steps that reason 80 and 100 tokens. `providerMetadata` describes one step, so only the
// SDK's usage can give the operation its 180.
const STEPS = [
  { candidates: 20, thoughts: 80, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
  { candidates: 20, thoughts: 100, finishReason: { unified: 'stop', raw: 'STOP' } },
];

function usage({ candidates, thoughts }) {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
    outputTokens: { total: candidates + thoughts, text: candidates, reasoning: thoughts },
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
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV3({
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
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV3({
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
  });
}

run();
