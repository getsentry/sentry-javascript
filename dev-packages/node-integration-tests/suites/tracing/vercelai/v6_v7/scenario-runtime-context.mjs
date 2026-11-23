import * as Sentry from '@sentry/node';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: { total: 10, noCache: 10, cached: 0 },
  outputTokens: { total: 20, noCache: 20, cached: 0 },
  totalTokens: { total: 30, noCache: 30, cached: 0 },
};

const tools = {
  getWeather: tool({
    description: 'Get the current weather for a location',
    inputSchema: z.object({ location: z.string() }),
    contextSchema: z.object({ units: z.string(), apiKey: z.string() }),
    execute: async ({ location }) => `Weather in ${location}: Sunny`,
  }),
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    let callCount = 0;
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () =>
          callCount++ === 0
            ? {
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'getWeather',
                    input: JSON.stringify({ location: 'Vienna' }),
                  },
                ],
                warnings: [],
              }
            : {
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
                content: [{ type: 'text', text: 'Sunny' }],
                warnings: [],
              },
      }),
      tools,
      stopWhen: stepCountIs(3),
      prompt: 'Weather in Vienna?',
      runtimeContext: { requestId: 'req_generate', tenantId: 'acme', apiToken: 'secret-runtime' },
      toolsContext: { getWeather: { units: 'metric', apiKey: 'secret-tool' } },
      telemetry: {
        isEnabled: true,
        functionId: 'support-chat',
        includeRuntimeContext: { requestId: true, tenantId: true },
        includeToolsContext: { getWeather: { units: true } },
      },
    });

    const result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Hello!' },
              { type: 'text-end', id: '0' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
            ],
          }),
        }),
      }),
      prompt: 'Hi',
      runtimeContext: { requestId: 'req_stream', apiToken: 'secret-runtime' },
      telemetry: {
        isEnabled: true,
        functionId: 'support-stream',
        includeRuntimeContext: { requestId: true },
      },
    });
    for await (const _part of result.fullStream) {
      void _part;
    }
  });

  await Sentry.flush(2000);
}

run();
