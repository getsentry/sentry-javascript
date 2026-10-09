import * as Sentry from '@sentry/node';
import { generateObject } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Test generateObject with schema
    await generateObject({
      model: new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 15, completionTokens: 25 },
          text: '{ "name": "John Doe", "age": 30 }',
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
}

run();
