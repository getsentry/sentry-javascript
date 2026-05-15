import * as Sentry from '@sentry/node';
import { embed } from 'ai';
import { MockEmbeddingModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await embed({
      model: new MockEmbeddingModelV3({
        doEmbed: async () => ({
          embeddings: [[0.1, 0.2, 0.3]],
          usage: { tokens: 5 },
        }),
      }),
      value: 'Hello world',
    });
  });
}

run();
