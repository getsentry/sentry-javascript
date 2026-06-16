import * as Sentry from '@sentry/node';
import { tracingChannel } from 'node:diagnostics_channel';

// Mirrors the AI SDK v7 publisher from vercel/ai#15660 without depending on an unpublished npm build.
const channel = tracingChannel('ai:telemetry');

const tools = {
  getWeather: {
    description: 'Get the current weather for a location',
  },
};

const usage = (inputTokens, outputTokens) => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
});

async function trace(type, event, execute) {
  return channel.tracePromise(execute, { type, event });
}

async function languageModelCall({ inputTokens, outputTokens, finishReason, content }) {
  return trace(
    'languageModelCall',
    {
      provider: 'mock-provider',
      modelId: 'mock-model-id',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }],
      tools,
    },
    async () => ({
      finishReason,
      usage: usage(inputTokens, outputTokens),
      content,
      response: { id: `response-${inputTokens}`, modelId: 'mock-model-id' },
    }),
  );
}

async function runWeatherAgent() {
  await trace(
    'generateText',
    {
      functionId: 'weather_agent',
      provider: 'mock-provider',
      modelId: 'mock-model-id',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }],
      tools,
    },
    async () => {
      await trace('step', { stepNumber: 0 }, async () => {
        await languageModelCall({
          inputTokens: 10,
          outputTokens: 20,
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: { location: 'San Francisco' },
            },
          ],
        });

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
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: { location: 'San Francisco' },
              output: 'Weather in San Francisco: Sunny, 72°F',
            },
          }),
        );

        return { finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: usage(10, 20) };
      });

      await trace('step', { stepNumber: 1 }, async () => {
        await languageModelCall({
          inputTokens: 15,
          outputTokens: 25,
          finishReason: { unified: 'stop', raw: 'stop' },
          content: [{ type: 'text', text: 'The weather in San Francisco is sunny.' }],
        });

        return { finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(15, 25) };
      });

      return {
        finishReason: { unified: 'stop', raw: 'stop' },
        totalUsage: usage(25, 45),
        content: [{ type: 'text', text: 'The weather in San Francisco is sunny.' }],
        responseModel: 'mock-model-id',
      };
    },
  );
}

async function runStreamAgent() {
  await trace(
    'streamText',
    {
      functionId: 'stream_agent',
      provider: 'mock-provider',
      modelId: 'mock-model-id',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Stream a greeting' }] }],
    },
    async () => {
      await trace('step', { stepNumber: 0 }, async () => {
        await languageModelCall({
          inputTokens: 3,
          outputTokens: 4,
          finishReason: { unified: 'stop', raw: 'stop' },
          content: [{ type: 'text', text: 'Hello' }],
        });

        return { finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(3, 4) };
      });

      return {
        finishReason: { unified: 'stop', raw: 'stop' },
        totalUsage: usage(3, 4),
        content: [{ type: 'text', text: 'Hello' }],
        responseModel: 'mock-model-id',
      };
    },
  );
}

async function run() {
  await Promise.resolve();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await runWeatherAgent();
    await runStreamAgent();

    await trace(
      'embed',
      {
        provider: 'mock-provider',
        modelId: 'mock-model-id',
        value: 'embed this text',
        recordInputs: true,
      },
      async () => ({ usage: { inputTokens: 7 } }),
    );

    await trace(
      'rerank',
      {
        functionId: 'reranker',
        provider: 'mock-provider',
        modelId: 'mock-model-id',
      },
      async () => ({ ranking: [{ index: 1, relevanceScore: 0.9 }] }),
    );
  });
}

run();
