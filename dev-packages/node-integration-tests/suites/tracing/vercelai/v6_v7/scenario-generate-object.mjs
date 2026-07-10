import * as Sentry from '@sentry/node';
import { generateObject } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateObject({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 15, noCache: 15, cached: 0 },
            outputTokens: { total: 25, noCache: 25, cached: 0 },
            totalTokens: { total: 40, noCache: 40, cached: 0 },
          },
          content: [{ type: 'text', text: '{ "name": "John Doe", "age": 30 }' }],
          warnings: [],
        }),
      }),
      schema: z.object({
        name: z.string().describe('The name of the person'),
        age: z.number().describe('The age of the person'),
      }),
      schemaName: 'Person',
      schemaDescription: 'A person with name and age',
      prompt: 'Generate a person object',
    });
  });

  await Sentry.flush(2000);
}

run();
