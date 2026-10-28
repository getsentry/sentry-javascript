import * as Sentry from '@sentry/node';
import { embed, embedMany } from 'ai';
import { MockEmbeddingModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Single embedding
    await embed({
      model: new MockEmbeddingModelV1({
        doEmbed: async () => ({
          embeddings: [[0.1, 0.2, 0.3]],
          usage: { tokens: 10 },
        }),
      }),
      value: 'Embedding test!',
    });

    // Multiple embeddings
    await embedMany({
      model: new MockEmbeddingModelV1({
        maxEmbeddingsPerCall: 5,
        doEmbed: async () => ({
          embeddings: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
          usage: { tokens: 20 },
        }),
      }),
      values: ['First input', 'Second input'],
    });
  });
}

run();
