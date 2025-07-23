import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import express from 'express';
import { createServer } from 'http';
import { z } from 'zod';

async function run() {
  const app = express();

  app.get('/api/chat', async (req, res) => {
    try {
      await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'Processing your request...',
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'calculateTool',
                args: '{ "a": 1, "b": 2 }',
              },
            ],
          }),
        }),
        experimental_telemetry: {
          functionId: 'Chat Assistant',
          recordInputs: true,
          recordOutputs: true,
          isEnabled: true,
        },
        tools: {
          calculateTool: tool({
            description: 'Calculate the result of a math problem. Returns a number.',
            parameters: z.object({
              a: z.number().describe('First number'),
              b: z.number().describe('Second number'),
            }),
            type: 'function',
            execute: async () => {
              throw new Error('Calculation service unavailable');
            },
          }),
        },
        maxSteps: 2,
        system: 'You are a helpful chat assistant.',
        prompt: 'What is 1 + 1?',
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  Sentry.setupExpressErrorHandler(app);

  const server = createServer(app);

  // Start server and make request
  server.listen(0, () => {
    const port = server.address()?.port;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ port }));

    // Make the request that will trigger the error
    fetch(`http://localhost:${port}/api/chat`)
      .then(() => {
        server.close();
      })
      .catch(() => {
        server.close();
      });
  });
}

run();
