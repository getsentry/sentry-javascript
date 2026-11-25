import * as Sentry from '@sentry/node';
import { experimental_extract } from 'ai';
import { Experimental_ExtractionMockModelV4 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await experimental_extract({
      model: new Experimental_ExtractionMockModelV4({
        provider: 'gateway',
        modelId: 'cloudflare/clairic',
        doExtract: async () => ({
          answers: {
            invoiceNumber: { type: 'text', value: 'INV-2291', confidence: 0.98 },
            total: { type: 'number', value: 1080, confidence: 0.95 },
          },
          usage: { inputTokens: 50, outputTokens: 4 },
          warnings: [],
        }),
      }),
      state: 'Invoice INV-2291 from Northwind Supply. Total due: $1,080.',
      fields: {
        invoiceNumber: { type: 'text', instructions: 'The invoice number' },
        total: { type: 'number', instructions: 'The total amount due' },
      },
    });
  });
}

run();
