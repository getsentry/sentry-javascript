import * as Sentry from '@sentry/node';
import { stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    let callCount = 0;

    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      model: new MockLanguageModelV3({
        doStream: async () => {
          // First step streams a tool call; after the tool runs, the second step streams the answer.
          if (callCount++ === 0) {
            return {
              stream: simulateReadableStream({
                chunks: [
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'getWeather',
                    input: JSON.stringify({ location: 'San Francisco' }),
                  },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage: {
                      inputTokens: { total: 10, noCache: 10, cached: 0 },
                      outputTokens: { total: 20, noCache: 20, cached: 0 },
                      totalTokens: { total: 30, noCache: 30, cached: 0 },
                    },
                  },
                ],
              }),
            };
          }
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: '0' },
                { type: 'text-delta', id: '0', delta: 'Sunny, ' },
                { type: 'text-delta', id: '0', delta: '72°F.' },
                { type: 'text-end', id: '0' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: {
                    inputTokens: { total: 15, noCache: 15, cached: 0 },
                    outputTokens: { total: 25, noCache: 25, cached: 0 },
                    totalTokens: { total: 40, noCache: 40, cached: 0 },
                  },
                },
              ],
            }),
          };
        },
      }),
      tools: {
        getWeather: tool({
          description: 'Get the current weather for a location',
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
        }),
      },
      stopWhen: stepCountIs(5),
      prompt: 'What is the weather in San Francisco?',
    });

    for await (const _part of result.fullStream) {
      void _part;
    }
  });
}

run();
