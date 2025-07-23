import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

async function run() {
  // Create a manual outer span (simulating the root span)
  await Sentry.startSpan({ op: 'outer', name: 'outer span', description: 'outer span' }, async () => {
    // It is expected that the error will bubble up naturally to the outer span
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'First span here!',
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
        functionId: 'Simple Agent',
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
            throw new Error('Not implemented');
          },
        }),
      },
      maxSteps: 2,
      system: 'You help users with their math problems.',
      prompt: 'What is 1 + 1?',
    });
  });
}

run();
