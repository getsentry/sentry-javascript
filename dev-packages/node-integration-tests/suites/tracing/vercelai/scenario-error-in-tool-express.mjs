import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import express from 'express';
import { z } from 'zod';

const app = express();

app.get('/test/error-in-tool', async (_req, res, next) => {
  Sentry.setTag('test-tag', 'test-value');

  try {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'tool-calls',
          usage: { promptTokens: 15, completionTokens: 25 },
          text: 'Tool call completed!',
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              args: '{ "location": "San Francisco" }',
            },
          ],
        }),
      }),
      tools: {
        getWeather: {
          parameters: z.object({ location: z.string() }),
          execute: async () => {
            throw new Error('Error in tool');
          },
        },
      },
      prompt: 'What is the weather in San Francisco?',
    });
  } catch (error) {
    next(error);
    return;
  }

  res.send({ message: 'OK' });
});
Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
