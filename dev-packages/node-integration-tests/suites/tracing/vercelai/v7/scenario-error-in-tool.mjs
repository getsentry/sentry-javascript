import * as Sentry from '@sentry/node';
import { tracingChannel } from 'node:diagnostics_channel';

// Mirrors the AI SDK v7 publisher from vercel/ai#15660 without depending on an unpublished npm build.
const channel = tracingChannel('ai:telemetry');

const usage = (inputTokens, outputTokens) => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
});

async function trace(type, event, execute) {
  return channel.tracePromise(execute, { type, event });
}

async function run() {
  await Promise.resolve();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await trace(
      'generateText',
      {
        functionId: 'weather_agent',
        provider: 'mock-provider',
        modelId: 'mock-model-id',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }],
      },
      async () => {
        await trace('step', { stepNumber: 0 }, async () => {
          await trace(
            'languageModelCall',
            {
              provider: 'mock-provider',
              modelId: 'mock-model-id',
              messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }],
            },
            async () => ({
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage: usage(8, 13),
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'getWeather',
                  input: { location: 'San Francisco' },
                },
              ],
              response: { id: 'response-error', modelId: 'mock-model-id' },
            }),
          );

          await trace(
            'executeTool',
            {
              toolCall: {
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: { location: 'San Francisco' },
              },
            },
            async () => ({
              output: {
                type: 'tool-error',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: { location: 'San Francisco' },
                error: new Error('Error in tool'),
              },
            }),
          );

          return { finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: usage(8, 13) };
        });

        return {
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          totalUsage: usage(8, 13),
          responseModel: 'mock-model-id',
        };
      },
    );
  });
}

run();
