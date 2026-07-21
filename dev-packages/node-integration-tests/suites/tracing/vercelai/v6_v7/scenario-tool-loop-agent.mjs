import * as Sentry from '@sentry/node';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    let callCount = 0;

    const agent = new ToolLoopAgent({
      experimental_telemetry: { isEnabled: true, functionId: 'weather_agent' },
      model: new MockLanguageModelV3({
        doGenerate: async () => {
          if (callCount++ === 0) {
            return {
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage: {
                inputTokens: { total: 10, noCache: 10, cached: 0 },
                outputTokens: { total: 20, noCache: 20, cached: 0 },
                totalTokens: { total: 30, noCache: 30, cached: 0 },
              },
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'getWeather',
                  input: JSON.stringify({ location: 'San Francisco' }),
                },
              ],
              warnings: [],
            };
          }
          return {
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 15, noCache: 15, cached: 0 },
              outputTokens: { total: 25, noCache: 25, cached: 0 },
              totalTokens: { total: 40, noCache: 40, cached: 0 },
            },
            content: [{ type: 'text', text: 'The weather in San Francisco is sunny, 72°F.' }],
            warnings: [],
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
      stopWhen: stepCountIs(3),
    });

    await agent.generate({
      prompt: 'What is the weather in San Francisco?',
    });
  });
}

run();
